'use strict';

const { loadConfig } = require('./config');
const logger = require('./logger');
const { BackendClient } = require('./backend-client');
const { discoverDevices, resolvePolicyTarget } = require('./device-discovery');
const { enrichWithFingerprint } = require('./fingerprint');
const { createFirewallController } = require('./firewall-controller');
const { ConntrackController } = require('./conntrack-controller');
const { TcpRstController } = require('./tcp-rst-controller');
const { QosController } = require('./qos-controller');
const { ManagementGuard } = require('./management-guard');
const { ConnectionKiller } = require('./connection-killer');
const { DnsSniffController } = require('./dns-sniff-controller');
const { VpnDetector } = require('./vpn-detector');
const { DnsResolveCache } = require('./dns-resolve-cache');
const { Metrics } = require('./metrics');

let stopping = false;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(targets) {
  return {
    total: targets.length,
    blocked: targets.filter((target) => target.action === 'BLOCK').length,
    throttled: targets.filter((target) => target.action === 'THROTTLE').length,
    unresolved: targets.filter((target) => target.action === 'BLOCK' && !target.ipAddress && !target.macAddress).length,
  };
}

async function syncOnce({ backend, firewall, connectionKiller, vpnDetector, qos, managementGuard, metrics, config }) {
  await managementGuard.refresh();

  const discovered = await discoverDevices(config, logger);
  const enriched = await enrichWithFingerprint(discovered, config, logger);
  if (enriched.length > 0) {
    await backend.reportDiscovery(enriched).catch((err) => {
      logger.warn('failed to report discovery', { error: err.message });
    });
  }

  const policies = await backend.getPolicies();
  const allTargets = (policies.devices || []).map((policy) => resolvePolicyTarget(policy, enriched));

  // Never enforce ANY action (kill, block, throttle, VPN/QUIC/bandwidth
  // rule) against the gateway's own management IP, no matter what the
  // backend policy says. This is the single upstream choke point for that
  // guarantee; connectionKiller additionally re-checks internally as
  // defense in depth, but firewall/qos/vpnDetector rely on this filter.
  const targets = managementGuard.filterTargets(allTargets);

  await connectionKiller.sync(targets);

  await firewall.sync({
    targets,
    dnsRedirectIp: config.dnsRedirectIp,
    enableDnsRedirect: config.enableDnsRedirect,
    enableQuicBlockGlobal: config.enableQuicBlockGlobal,
  });

  const quicBlockedCount = targets.filter(
    (target) => target.ipAddress && (config.enableQuicBlockGlobal || target.quicBlock),
  ).length;
  if (quicBlockedCount > 0) {
    metrics.inc('quicBlock.enforced', quicBlockedCount);
    logger.info('quic (udp/443) blocking enforced', {
      devices: quicBlockedCount,
      global: config.enableQuicBlockGlobal,
    });
  }

  await qos.sync(targets);

  if (config.enableVpnBlock) {
    const detections = await vpnDetector.sync(targets);
    if (detections.length > 0) {
      await backend.reportVpnDetections(detections).catch((err) => {
        logger.warn('failed to report vpn detections', { error: err.message });
      });
    }
  }

  logger.info('gateway policy sync complete', { ...summarize(targets), metrics: metrics.flush() });
}

async function main() {
  const config = loadConfig();
  const backend = new BackendClient(config);
  const firewall = createFirewallController(config, logger);
  const conntrack = new ConntrackController(config, logger);
  const tcpReset = new TcpRstController(config, logger, conntrack);
  const metrics = new Metrics();
  const dnsResolveCache = new DnsResolveCache();
  const qos = new QosController(config, logger, metrics, dnsResolveCache);
  const managementGuard = new ManagementGuard(config, logger);
  const connectionKiller = new ConnectionKiller({
    conntrack,
    tcpReset,
    managementGuard,
    metrics,
    logger,
  });
  const dnsSniff = new DnsSniffController(config, logger);
  const vpnDetector = new VpnDetector({ conntrack, dnsSniff, metrics, logger });

  logger.info('GuardTime gateway-agent starting', {
    backendUrl: config.backendUrl,
    pollIntervalMs: config.pollIntervalMs,
    dnsRedirectIp: config.enableDnsRedirect ? config.dnsRedirectIp : null,
    qosInterfaces: config.qosInterfaces,
    firewallBackend: config.firewallBackend,
    managementIps: config.managementIps,
    dryRun: config.dryRun,
  });

  while (!stopping) {
    try {
      await syncOnce({ backend, firewall, connectionKiller, vpnDetector, qos, managementGuard, metrics, config });
    } catch (err) {
      logger.error('gateway policy sync failed', { error: err.message });
    }
    await sleep(config.pollIntervalMs);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    logger.info(`received ${signal}, stopping after current sync`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    logger.error('fatal startup error', { error: err.message });
    process.exit(1);
  });
}

module.exports = { syncOnce, summarize };

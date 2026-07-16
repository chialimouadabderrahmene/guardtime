'use strict';

const { loadConfig } = require('./config');
const logger = require('./logger');
const { BackendClient } = require('./backend-client');
const { discoverDevices, resolvePolicyTarget } = require('./device-discovery');
const { IptablesController } = require('./iptables-controller');
const { ConntrackController } = require('./conntrack-controller');
const { TcpRstController } = require('./tcp-rst-controller');
const { QosController } = require('./qos-controller');

let stopping = false;
const deviceStates = new Map();

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

function shouldRunActiveTermination(target) {
  const previous = deviceStates.get(target.deviceId);
  return (
    target.action === 'BLOCK' &&
    target.ipAddress &&
    (
      !previous ||
      previous.action !== 'BLOCK' ||
      previous.ipAddress !== target.ipAddress ||
      previous.macAddress !== target.macAddress
    )
  );
}

function rememberStates(targets) {
  const seen = new Set();
  for (const target of targets) {
    seen.add(target.deviceId);
    deviceStates.set(target.deviceId, {
      action: target.action,
      ipAddress: target.ipAddress,
      macAddress: target.macAddress,
    });
  }
  for (const deviceId of deviceStates.keys()) {
    if (!seen.has(deviceId)) deviceStates.delete(deviceId);
  }
}

async function applyActiveTermination(targets, conntrack, tcpReset) {
  for (const target of targets) {
    if (!shouldRunActiveTermination(target)) continue;

    const flows = await conntrack.listTcpConnections(target.ipAddress).catch((err) => {
      logger.warn('failed to capture tcp flows before block', { deviceId: target.deviceId, error: err.message });
      return [];
    });

    logger.info('active block transition detected', {
      deviceId: target.deviceId,
      ipAddress: target.ipAddress,
      macAddress: target.macAddress,
      tcpFlows: flows.length,
    });

    await conntrack.killDevice(target.ipAddress);
    await tcpReset.killDevice(target.ipAddress, flows);
  }
}

async function syncOnce({ backend, firewall, conntrack, tcpReset, qos, config }) {
  const discovered = await discoverDevices(config, logger);
  if (discovered.length > 0) {
    await backend.reportDiscovery(discovered).catch((err) => {
      logger.warn('failed to report discovery', { error: err.message });
    });
  }

  const policies = await backend.getPolicies();
  const targets = (policies.devices || []).map((policy) => resolvePolicyTarget(policy, discovered));

  await applyActiveTermination(targets, conntrack, tcpReset);

  await firewall.sync({
    targets,
    dnsRedirectIp: config.dnsRedirectIp,
    enableDnsRedirect: config.enableDnsRedirect,
  });

  await qos.sync(targets);
  rememberStates(targets);

  logger.info('gateway policy sync complete', summarize(targets));
}

async function main() {
  const config = loadConfig();
  const backend = new BackendClient(config);
  const firewall = new IptablesController(config, logger);
  const conntrack = new ConntrackController(config, logger);
  const tcpReset = new TcpRstController(config, logger, conntrack);
  const qos = new QosController(config, logger);

  logger.info('GuardTime gateway-agent starting', {
    backendUrl: config.backendUrl,
    pollIntervalMs: config.pollIntervalMs,
    dnsRedirectIp: config.enableDnsRedirect ? config.dnsRedirectIp : null,
    qosInterfaces: config.qosInterfaces,
    dryRun: config.dryRun,
  });

  while (!stopping) {
    try {
      await syncOnce({ backend, firewall, conntrack, tcpReset, qos, config });
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

main().catch((err) => {
  logger.error('fatal startup error', { error: err.message });
  process.exit(1);
});

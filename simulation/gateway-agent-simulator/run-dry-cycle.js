'use strict';

// Drives the REAL gateway-agent modules (Layers 3-7: connection killer,
// firewall/nftables, VPN detector, QUIC block, bandwidth control) through
// one full sync cycle in dry-run mode. This is the piece the rest of the
// Simulation Lab cannot exercise: gateway-agent is a standalone daemon meant
// to run on a customer's Linux router, not inside this Node/Windows-only
// harness, and its `dryRun` flag exists exactly so its real wiring can be
// verified without shelling out to iptables/tc/conntrack.
//
// What this proves: the full main.js orchestration (syncOnce) — discovery,
// connection-killer, firewall sync (block + VPN + QUIC rules), bandwidth
// control, VPN detection — runs end-to-end without throwing, against a
// realistic multi-device policy payload, and that the management-guard
// correctly refuses to enforce against the gateway's own IP even though its
// (deliberately adversarial) test policy says BLOCK.
//
// What this does NOT prove: that the *Linux* commands themselves (iptables,
// tc, conntrack, nft) behave correctly on a real kernel — dryRun skips
// actually invoking them. That is out of reach for a Windows-only lab and is
// covered instead by gateway-agent's own unit tests (mocking execFile and
// asserting the exact command arguments), which run on every platform.

const path = require('node:path');

const AGENT_SRC = path.join(__dirname, '..', '..', 'gateway-agent', 'src');
const req = (name) => require(path.join(AGENT_SRC, name));

const logger = req('logger');
const { createFirewallController } = req('firewall-controller');
const { ConntrackController } = req('conntrack-controller');
const { TcpRstController } = req('tcp-rst-controller');
const { QosController } = req('qos-controller');
const { ManagementGuard } = req('management-guard');
const { ConnectionKiller } = req('connection-killer');
const { DnsSniffController } = req('dns-sniff-controller');
const { VpnDetector } = req('vpn-detector');
const { DnsResolveCache } = req('dns-resolve-cache');
const { RouterCommandExecutor } = req('router-command-executor');
const { Metrics } = req('metrics');
const { syncOnce } = req('main');

const MGMT_IP = '10.0.0.1';

function buildConfig() {
  return {
    backendUrl: 'http://sim.invalid',
    gatewayToken: 'sim-token',
    pollIntervalMs: 3000,
    dnsRedirectIp: '10.0.0.53',
    enableDnsRedirect: true,
    dryRun: true, // <-- the whole point: no real Linux command ever executes
    iptablesBin: 'iptables',
    conntrackBin: 'conntrack',
    tcBin: 'tc',
    pythonBin: 'python3',
    ipBin: 'ip',
    arpBin: 'arp',
    enableConntrackKill: true,
    enableTcpRst: true,
    tcpRstSniffMs: 200,
    enableQos: true,
    qosRate: '1kbit',
    qosDefaultRate: '1000mbit',
    qosInterfaces: ['eth0'],
    managementIps: [MGMT_IP],
    firewallBackend: 'iptables',
    nftBin: 'nft',
    enableVpnBlock: true,
    enableVpnDnsSniff: false, // no scapy/python dependency needed for the sim
    vpnDnsSniffMs: 200,
    enableQuicBlockGlobal: false, // exercised via per-device quicBlock instead
    enableBandwidthControl: true,
    ipsetBin: 'ipset',
    dhcpLeasesFile: '',
    enableOsHint: false,
    pingBin: 'ping',
    osHintTimeoutMs: 500,
    lanInterface: '',
    wanInterface: '',
  };
}

/**
 * A realistic multi-device policy payload covering every layer at once:
 * - dev-blocked: FULL_INTERNET_LOCK + VPN block + QUIC block (Layers 3, 5, 6)
 * - dev-throttled: soft-paused + a device-level bandwidth cap (Layer 7)
 * - dev-normal: allowed, but its GAMING traffic is bandwidth-capped (Layer 7)
 * - gw-mgmt: a hostile test case — policy says BLOCK, but its IP is the
 *   gateway's own management IP, so it must never actually be enforced
 *   against (Layer 3's core safety requirement).
 */
function buildFakeBackend() {
  const now = new Date().toISOString();
  const reported = { discovery: null, vpnDetections: null };

  return {
    reported,
    async getPolicies() {
      return {
        gatewayId: 'sim-gw',
        generatedAt: now,
        dnsRedirect: { enabled: true, resolverIp: '10.0.0.53' },
        devices: [
          {
            deviceId: 'dev-blocked',
            name: 'Blocked Kid Phone',
            macAddress: 'aa:bb:cc:dd:ee:01',
            ipAddress: '192.168.50.11',
            dnsSourceIp: '192.168.50.11',
            action: 'BLOCK',
            reason: 'BEDTIME',
            internetLocked: true,
            internetLockedAt: now,
            blockingMode: 'FULL_INTERNET_LOCK',
            vpnBlock: true,
            quicBlock: true,
            bandwidthLimits: [],
            updatedAt: now,
          },
          {
            deviceId: 'dev-throttled',
            name: 'Tablet',
            macAddress: 'aa:bb:cc:dd:ee:02',
            ipAddress: '192.168.50.12',
            dnsSourceIp: '192.168.50.12',
            action: 'THROTTLE',
            reason: 'SOFT_PAUSE',
            internetLocked: false,
            internetLockedAt: null,
            blockingMode: 'GAMING_ONLY',
            vpnBlock: false,
            quicBlock: false,
            bandwidthLimits: [{ category: null, downloadKbps: 2000, uploadKbps: 1000 }],
            updatedAt: now,
          },
          {
            deviceId: 'dev-normal',
            name: 'Laptop',
            macAddress: 'aa:bb:cc:dd:ee:03',
            ipAddress: '192.168.50.13',
            dnsSourceIp: '192.168.50.13',
            action: 'ALLOW',
            reason: null,
            internetLocked: false,
            internetLockedAt: null,
            blockingMode: 'GAMING_ONLY',
            vpnBlock: true,
            quicBlock: false,
            bandwidthLimits: [{ category: 'GAMING', downloadKbps: 512, uploadKbps: 512 }],
            updatedAt: now,
          },
          {
            deviceId: 'gw-mgmt',
            name: 'Router management IP (must never be enforced against)',
            macAddress: 'aa:bb:cc:dd:ee:00',
            ipAddress: MGMT_IP,
            dnsSourceIp: MGMT_IP,
            action: 'BLOCK',
            reason: 'ADVERSARIAL_TEST_CASE',
            internetLocked: true,
            internetLockedAt: now,
            blockingMode: 'FULL_INTERNET_LOCK',
            vpnBlock: false,
            quicBlock: false,
            bandwidthLimits: [],
            updatedAt: now,
          },
        ],
      };
    },
    async reportDiscovery(devices) {
      reported.discovery = devices;
      return { updated: 0 };
    },
    async reportVpnDetections(detections) {
      reported.vpnDetections = detections;
      return { recorded: detections.length };
    },
    async reportRouterDetection(detection) {
      reported.routerDetection = detection;
      return { updated: 0 };
    },
    async getRouterCommands() {
      return { commands: [], routerConnection: null };
    },
    async ackRouterCommand(commandId, success, resultData) {
      reported.routerCommandAck = { commandId, success, resultData };
      return { acked: true };
    },
  };
}

/**
 * Runs one full syncOnce() cycle with real controllers and returns
 * {ok, logLines, backend, error} — logLines lets callers assert on specific
 * enforcement decisions without needing metrics.flush() (which main.js
 * resets as part of its own summary logging).
 */
async function runGatewayAgentDryCycle() {
  const config = buildConfig();
  const backend = buildFakeBackend();
  const firewall = createFirewallController(config, logger);
  const conntrack = new ConntrackController(config, logger);
  const tcpReset = new TcpRstController(config, logger, conntrack);
  const metrics = new Metrics();
  const dnsResolveCache = new DnsResolveCache();
  const qos = new QosController(config, logger, metrics, dnsResolveCache);
  const managementGuard = new ManagementGuard(config, logger);
  const connectionKiller = new ConnectionKiller({ conntrack, tcpReset, managementGuard, metrics, logger });
  const dnsSniff = new DnsSniffController(config, logger);
  const vpnDetector = new VpnDetector({ conntrack, dnsSniff, metrics, logger });
  const routerCommandExecutor = new RouterCommandExecutor({ backend, config, logger });

  const logLines = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args) => { logLines.push(args.join(' ')); };
  console.warn = (...args) => { logLines.push(args.join(' ')); };
  console.error = (...args) => { logLines.push(args.join(' ')); };

  let error = null;
  try {
    await syncOnce({ backend, firewall, connectionKiller, vpnDetector, qos, managementGuard, routerCommandExecutor, metrics, config });
  } catch (err) {
    error = err;
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  return { ok: !error, error, logLines, backend };
}

module.exports = { runGatewayAgentDryCycle };

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function bool(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function loadConfig() {
  loadDotEnv();

  const config = {
    // The gateway agent runs on the customer's router, so it reaches the
    // backend over the public internet.
    backendUrl: (process.env.BACKEND_URL || 'https://api.waqti.pro').replace(/\/$/, ''),
    gatewayToken: process.env.GATEWAY_TOKEN || '',
    pollIntervalMs: int('POLL_INTERVAL_MS', 3000),
    dnsRedirectIp: process.env.DNS_REDIRECT_IP || '',
    enableDnsRedirect: bool('ENABLE_DNS_REDIRECT', true),
    dryRun: bool('DRY_RUN', false),
    iptablesBin: process.env.IPTABLES_BIN || 'iptables',
    conntrackBin: process.env.CONNTRACK_BIN || 'conntrack',
    tcBin: process.env.TC_BIN || 'tc',
    pythonBin: process.env.PYTHON_BIN || 'python3',
    ipBin: process.env.IP_BIN || 'ip',
    arpBin: process.env.ARP_BIN || 'arp',
    enableConntrackKill: bool('ENABLE_CONNTRACK_KILL', true),
    enableTcpRst: bool('ENABLE_TCP_RST', true),
    tcpRstSniffMs: int('TCP_RST_SNIFF_MS', 700),
    enableQos: bool('ENABLE_QOS', true),
    qosRate: process.env.QOS_RATE || '1kbit',
    qosDefaultRate: process.env.QOS_DEFAULT_RATE || '1000mbit',
    qosInterfaces: (process.env.QOS_INTERFACES || '')
      .split(',')
      .map((iface) => iface.trim())
      .filter(Boolean),

    // Layer 3: explicit IPs that must never be blocked/killed/throttled, in
    // addition to the gateway's own dynamically-detected management IP.
    managementIps: (process.env.GATEWAY_MANAGEMENT_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),

    // Layer 3: 'iptables' (default, preserves existing behaviour) or
    // 'nftables'. Opt-in only so existing deployments are unaffected.
    firewallBackend: (process.env.FIREWALL_BACKEND || 'iptables').toLowerCase(),
    nftBin: process.env.NFT_BIN || 'nft',

    // Layer 5: VPN blocking is enforced per-device via the policy payload's
    // vpnBlock flag; this just controls whether the agent honours it at all.
    enableVpnBlock: bool('ENABLE_VPN_BLOCK', true),

    // Layer 5: DNS-pattern detection needs a short passive sniff per device
    // per cycle (same scapy technique already used for TCP RST injection).
    // Off by default — opt-in, since it adds a sniff window to every cycle.
    enableVpnDnsSniff: bool('ENABLE_VPN_DNS_SNIFF', false),
    vpnDnsSniffMs: int('VPN_DNS_SNIFF_MS', 500),

    // Layer 6: QUIC (HTTP/3, UDP/443) blocking. Global applies to every
    // device; per-device is still driven by the policy payload's quicBlock
    // flag either way.
    enableQuicBlockGlobal: bool('ENABLE_QUIC_BLOCK_GLOBAL', false),

    // Layer 7: bandwidth control.
    enableBandwidthControl: bool('ENABLE_BANDWIDTH_CONTROL', true),
    ipsetBin: process.env.IPSET_BIN || 'ipset',

    // Layer 7: dedicated LAN/WAN interfaces let download and upload be
    // shaped independently and correctly. Left unset, both directions fall
    // back to qosInterfaces (works, but on a single shared interface only
    // whichever direction actually egresses there is shaped correctly).
    lanInterface: process.env.LAN_INTERFACE || '',
    wanInterface: process.env.WAN_INTERFACE || '',

    // Layer 4: optional dnsmasq-format lease file for hostname/DHCP-client-id
    // enrichment. Left unset, fingerprinting still works from MAC/IP alone.
    dhcpLeasesFile: process.env.DHCP_LEASES_FILE || '',

    // Layer 4: OS hint is a best-effort TTL heuristic that requires actively
    // pinging every discovered device each cycle. Off by default so a stock
    // deployment never sends extra probe traffic; opt-in via env.
    enableOsHint: bool('ENABLE_OS_HINT', false),
    pingBin: process.env.PING_BIN || 'ping',
    osHintTimeoutMs: int('OS_HINT_TIMEOUT_MS', 1000),
  };

  if (!config.gatewayToken) {
    throw new Error('GATEWAY_TOKEN is required');
  }
  if (config.enableDnsRedirect && !config.dnsRedirectIp) {
    throw new Error('DNS_REDIRECT_IP is required when ENABLE_DNS_REDIRECT=true');
  }

  return config;
}

module.exports = { loadConfig };

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_FILE = path.join(__dirname, '..', '.env');

function loadDotEnv() {
  const file = ENV_FILE;
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
    iptablesSaveBin: process.env.IPTABLES_SAVE_BIN || 'iptables-save',
    iptablesRestoreBin: process.env.IPTABLES_RESTORE_BIN || 'iptables-restore',

    // IPv6 mirror of every rule the v4 controllers apply — on by default so
    // a dual-stack device (most home ISPs hand out IPv6 today) can't bypass
    // enforcement just by using its v6 address. Per-target IPv6 rules are
    // only added for devices gateway-agent has actually discovered an IPv6
    // neighbor-table entry for (see device-discovery.js); a host with no
    // ip6tables/nft-ipv6 support at all can set ENABLE_IPV6=false and fall
    // back to v4-only behaviour identical to before this flag existed.
    enableIpv6: bool('ENABLE_IPV6', true),
    ip6tablesBin: process.env.IP6TABLES_BIN || 'ip6tables',
    ip6tablesSaveBin: process.env.IP6TABLES_SAVE_BIN || 'ip6tables-save',
    ip6tablesRestoreBin: process.env.IP6TABLES_RESTORE_BIN || 'ip6tables-restore',
    dnsRedirectIpv6: process.env.DNS_REDIRECT_IPV6 || '',

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

    // Layer 5b: JA3 TLS-fingerprint detection — same opt-in posture as the
    // DNS sniff above (adds a sniff window per device per cycle). The
    // known-signature denylist is empty unless an operator supplies real,
    // verified JA3 hashes — see tls-fingerprint-detector.js for why none
    // are hardcoded here.
    enableTlsFingerprint: bool('ENABLE_TLS_FINGERPRINT', false),
    tlsFingerprintSniffMs: int('TLS_FINGERPRINT_SNIFF_MS', 800),
    tlsVpnJa3Hashes: (process.env.TLS_VPN_JA3_HASHES || '')
      .split(',')
      .map((hash) => hash.trim().toLowerCase())
      .filter(Boolean),

    // Layer 6: QUIC (HTTP/3, UDP/443) blocking. Global applies to every
    // device; per-device is still driven by the policy payload's quicBlock
    // flag either way.
    enableQuicBlockGlobal: bool('ENABLE_QUIC_BLOCK_GLOBAL', false),

    // Layer 8: DoH/DoT protection. Global (not per-device) — DNS-over-TLS
    // and known-provider DNS-over-HTTPS have no legitimate reason to be
    // exempted for a specific device once a household opts in, unlike VPN
    // blocking which parents may want device-specific. See
    // doh-dot-patterns.js for exactly what this does and does not catch.
    enableDohBlock: bool('ENABLE_DOH_BLOCK', true),
    enableDohDnsSniff: bool('ENABLE_DOH_DNS_SNIFF', false),
    dohDnsSniffMs: int('DOH_DNS_SNIFF_MS', 500),

    // Operator-configurable DoH reputation list — same honest-empty-default
    // posture as tlsVpnJa3Hashes above: no hardcoded "known self-hosted DoH"
    // IPs/domains beyond the publicly-documented major providers already in
    // doh-dot-patterns.js, since there is no threat-intel feed available in
    // this environment to populate one responsibly. An operator who has
    // identified a specific self-hosted DoH endpoint (their own lab, a
    // vetted blocklist they trust) can add it here without a code change;
    // entries feed both detection (doh-detector.js) and the firewall block
    // rule (ensureDohDotBlock/addDohDotBlockRules), same as the built-in
    // provider list.
    dohReputationIps: (process.env.DOH_REPUTATION_IPS || '')
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean),
    dohReputationDomains: (process.env.DOH_REPUTATION_DOMAINS || '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),

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

    // Router Integration Engine: automatic router detection. On by default
    // — read-only (SSDP/mDNS/HTTP-header probes, no login attempted) so it
    // is safe to run every cycle; only reports findings, never acts on them.
    enableRouterDetection: bool('ENABLE_ROUTER_DETECTION', true),
    routerDetectionIntervalMs: int('ROUTER_DETECTION_INTERVAL_MS', 300000),
    routerSsdpTimeoutMs: int('ROUTER_SSDP_TIMEOUT_MS', 1500),
    routerMdnsTimeoutMs: int('ROUTER_MDNS_TIMEOUT_MS', 1200),
  };

  if (!config.gatewayToken) {
    throw new Error('GATEWAY_TOKEN is required');
  }
  if (config.enableDnsRedirect && !config.dnsRedirectIp) {
    throw new Error('DNS_REDIRECT_IP is required when ENABLE_DNS_REDIRECT=true');
  }

  return config;
}

module.exports = { loadConfig, ENV_FILE };

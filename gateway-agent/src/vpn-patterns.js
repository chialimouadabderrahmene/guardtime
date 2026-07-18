'use strict';

const { ipInCidr } = require('./cidr');

/**
 * Layer 5 VPN detection patterns. Like the project's other pattern lists
 * (strict-mode DoH resolvers, gaming category domains), this is deliberately
 * a best-effort, non-exhaustive set — commercial VPN providers rotate
 * infrastructure IPs constantly, so only the few protocol/endpoint
 * signatures that are actually stable (well-known ports, publicly
 * documented CDN ranges, provider-run domains) are listed. A device using an
 * unlisted VPN/provider simply won't be detected — this is a real limitation,
 * not a placeholder.
 */
const VPN_DNS_PATTERNS = [
  { suffix: 'nordvpn.com', provider: 'NordVPN' },
  { suffix: 'nordvpn.net', provider: 'NordVPN' },
  { suffix: 'protonvpn.com', provider: 'ProtonVPN' },
  { suffix: 'protonvpn.net', provider: 'ProtonVPN' },
  { suffix: 'surfshark.com', provider: 'Surfshark' },
  { suffix: 'mullvad.net', provider: 'Mullvad' },
  { suffix: 'cloudflareclient.com', provider: 'Cloudflare WARP' },
];

const VPN_PORT_SIGNATURES = [
  { protocol: 'udp', port: 51820, provider: 'WireGuard' },
  { protocol: 'udp', port: 1194, provider: 'OpenVPN' },
  { protocol: 'udp', port: 500, provider: 'IKEv2/IPsec' },
  { protocol: 'udp', port: 4500, provider: 'IKEv2/IPsec (NAT-T)' },
  { protocol: 'udp', port: 2408, provider: 'Cloudflare WARP' },
];

// Publicly documented, relatively stable ranges only (Cloudflare's WARP
// egress). Commercial VPN providers don't publish stable ranges, so they are
// covered via DNS/port signatures instead, not here.
const VPN_IP_RANGES = [
  { cidr: '162.159.192.0/24', provider: 'Cloudflare WARP' },
  { cidr: '162.159.193.0/24', provider: 'Cloudflare WARP' },
];

function matchVpnDomain(domain) {
  if (!domain) return null;
  const normalized = domain.toLowerCase().replace(/\.$/, '');
  for (const pattern of VPN_DNS_PATTERNS) {
    if (normalized === pattern.suffix || normalized.endsWith(`.${pattern.suffix}`)) return pattern.provider;
  }
  return null;
}

function matchVpnPort(protocol, port) {
  const match = VPN_PORT_SIGNATURES.find((sig) => sig.protocol === protocol && sig.port === port);
  return match ? match.provider : null;
}

function matchVpnIp(ipAddress) {
  if (!ipAddress) return null;
  for (const range of VPN_IP_RANGES) {
    if (ipInCidr(ipAddress, range.cidr)) return range.provider;
  }
  return null;
}

module.exports = {
  VPN_DNS_PATTERNS,
  VPN_PORT_SIGNATURES,
  VPN_IP_RANGES,
  matchVpnDomain,
  matchVpnPort,
  matchVpnIp,
};

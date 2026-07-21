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
 *
 * Every signature carries a `weight` (0-100): how strongly a single match
 * on its own indicates a VPN, used by vpn-detector.js to build a confidence
 * score instead of a binary yes/no. These are hand-assigned engineering
 * judgment calls (documented per-entry below), not derived from any
 * calibration dataset — there is no labeled traffic corpus available in
 * this environment to fit real probabilities against. Treat the resulting
 * scores as "how much signal fired," not a statistically calibrated
 * probability of VPN use.
 */
const VPN_DNS_PATTERNS = [
  { suffix: 'nordvpn.com', provider: 'NordVPN', weight: 85 },
  { suffix: 'nordvpn.net', provider: 'NordVPN', weight: 85 },
  { suffix: 'protonvpn.com', provider: 'ProtonVPN', weight: 85 },
  { suffix: 'protonvpn.net', provider: 'ProtonVPN', weight: 85 },
  { suffix: 'surfshark.com', provider: 'Surfshark', weight: 85 },
  { suffix: 'mullvad.net', provider: 'Mullvad', weight: 85 },
  { suffix: 'cloudflareclient.com', provider: 'Cloudflare WARP', weight: 80 },
];

// High-confidence: ports with no common legitimate non-VPN use on a home
// network, so it's safe for these to feed BOTH detection and the firewall's
// automatic block rule (addVpnBlockRules in iptables/nftables-controller.js).
const VPN_PORT_SIGNATURES = [
  { protocol: 'udp', port: 51820, provider: 'WireGuard', weight: 90 },
  { protocol: 'udp', port: 1194, provider: 'OpenVPN', weight: 90 },
  { protocol: 'tcp', port: 1194, provider: 'OpenVPN (TCP)', weight: 85 },
  { protocol: 'udp', port: 500, provider: 'IKEv2/IPsec', weight: 75 },
  { protocol: 'udp', port: 4500, provider: 'IKEv2/IPsec (NAT-T)', weight: 75 },
  { protocol: 'udp', port: 2408, provider: 'Cloudflare WARP', weight: 80 },
  // L2TP itself is UDP/1701, but it's essentially always paired with IPsec
  // (500/4500 above), which fire first in practice. Still listed for a
  // client that doesn't negotiate full IPsec.
  { protocol: 'udp', port: 1701, provider: 'L2TP', weight: 70 },
  { protocol: 'tcp', port: 1723, provider: 'PPTP', weight: 80 },
  { protocol: 'tcp', port: 992, provider: 'SoftEther', weight: 75 },
  { protocol: 'tcp', port: 5555, provider: 'SoftEther', weight: 60 }, // 5555 collides with a few unrelated dev tools — slightly lower
  { protocol: 'udp', port: 41194, provider: 'Outline (Shadowsocks, common default)', weight: 55 }, // Shadowsocks is designed to be unfingerprintable — port alone is weak
  { protocol: 'udp', port: 41641, provider: 'Tailscale', weight: 85 },
  { protocol: 'udp', port: 9993, provider: 'ZeroTier', weight: 85 },
];

// Low-confidence / detection-only: these ports are shared with common
// legitimate self-hosted services (dev servers, Squid, admin panels).
// Feeding these into the automatic firewall block rule would risk blocking
// real traffic that has nothing to do with a VPN, so they only ever
// produce a detection/alert (matchVpnPortDetectionOnly), never an
// auto-block — a parent decides what to do with the alert, the firewall
// doesn't decide for them.
//
// Deliberately does NOT include port 443: SoftEther's entire design point
// is being indistinguishable from ordinary HTTPS at the port level, and
// every device's normal web browsing also uses 443 — a bare port match
// there would false-positive on virtually all internet traffic. Detecting
// SoftEther's HTTPS-camouflage mode needs actual TLS ClientHello
// inspection, not a port list — see tls-fingerprint-detector.js.
const VPN_DETECTION_ONLY_PORT_SIGNATURES = [
  { protocol: 'tcp', port: 1080, provider: 'SOCKS proxy', weight: 30 },
  { protocol: 'tcp', port: 3128, provider: 'HTTP/HTTPS proxy (Squid default)', weight: 25 },
  { protocol: 'tcp', port: 8080, provider: 'HTTP/HTTPS proxy', weight: 20 }, // extremely common for unrelated self-hosted apps too
];

// Publicly documented, relatively stable ranges only (Cloudflare's WARP
// egress, Tailscale's CGNAT range). Commercial VPN providers don't publish
// stable ranges, so they are covered via DNS/port signatures instead, not
// here.
const VPN_IP_RANGES = [
  { cidr: '162.159.192.0/24', provider: 'Cloudflare WARP', weight: 85 },
  { cidr: '162.159.193.0/24', provider: 'Cloudflare WARP', weight: 85 },
  // Tailscale assigns every device a stable address in the shared CGNAT
  // range 100.64.0.0/10 (RFC 6598) — a device with active traffic to/from
  // this range is very likely tunneled through Tailscale's relay/direct
  // path, since almost nothing else legitimately uses this range on a
  // home network.
  { cidr: '100.64.0.0/10', provider: 'Tailscale', weight: 70 },
];

function matchVpnDomain(domain) {
  if (!domain) return null;
  const normalized = domain.toLowerCase().replace(/\.$/, '');
  for (const pattern of VPN_DNS_PATTERNS) {
    if (normalized === pattern.suffix || normalized.endsWith(`.${pattern.suffix}`)) {
      return { provider: pattern.provider, weight: pattern.weight };
    }
  }
  return null;
}

function matchVpnPort(protocol, port) {
  const match = VPN_PORT_SIGNATURES.find((sig) => sig.protocol === protocol && sig.port === port);
  return match ? { provider: match.provider, weight: match.weight } : null;
}

/** Detection-only signal — never feeds the automatic firewall block rule. */
function matchVpnPortDetectionOnly(protocol, port) {
  const match = VPN_DETECTION_ONLY_PORT_SIGNATURES.find((sig) => sig.protocol === protocol && sig.port === port);
  return match ? { provider: match.provider, weight: match.weight } : null;
}

function matchVpnIp(ipAddress) {
  if (!ipAddress) return null;
  for (const range of VPN_IP_RANGES) {
    if (ipInCidr(ipAddress, range.cidr)) return { provider: range.provider, weight: range.weight };
  }
  return null;
}

module.exports = {
  VPN_DNS_PATTERNS,
  VPN_PORT_SIGNATURES,
  VPN_DETECTION_ONLY_PORT_SIGNATURES,
  VPN_IP_RANGES,
  matchVpnDomain,
  matchVpnPort,
  matchVpnPortDetectionOnly,
  matchVpnIp,
};

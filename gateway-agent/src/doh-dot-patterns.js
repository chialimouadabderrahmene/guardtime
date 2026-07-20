'use strict';

/**
 * DoH/DoT blocking signatures. Same honesty constraint as vpn-patterns.js:
 * this is IP/port-list based, not SNI or TLS-ClientHello inspection — a
 * real DPI/SNI-filtering engine would need a new native dependency (nDPI,
 * or a userspace TLS parser wired into nfqueue) that doesn't exist in this
 * codebase and is out of scope for a bolt-on fix. What's here reliably
 * blocks the common case (a browser/OS DoH default pointed at a major
 * public provider) and unconditionally blocks DoT (port 853 has no
 * legitimate non-DNS use, so it's safe to always drop rather than
 * allowlist). A DoH endpoint on an unlisted IP, or DoH tunneled through a
 * CDN IP shared with unrelated traffic, is not caught by this layer — see
 * dns-sniff-controller.js's TLS-SNI probe (doh-detector.js) for the
 * detection-only complement to this list.
 */

// DoT (DNS-over-TLS, RFC 7858) and DNS-over-QUIC (RFC 9250) both have a
// single standard port each with no other legitimate protocol on them.
const DOT_PORTS = [853];

// Public DoH resolver IPs stable enough to block directly. Pulled from each
// provider's own published anycast documentation (not scraped/inferred).
// Kept as a plain array — like vpn-patterns.js, deliberately not exhaustive
// (no auto-updating remote feed; the agent has no runtime dependency on
// internet reachability to enforce a policy). Extend it in a code change
// when a new provider needs blocking.
const DOH_PROVIDER_IPS = [
  { name: 'Cloudflare', ip: '1.1.1.1' },
  { name: 'Cloudflare', ip: '1.0.0.1' },
  { name: 'Google', ip: '8.8.8.8' },
  { name: 'Google', ip: '8.8.4.4' },
  { name: 'Quad9', ip: '9.9.9.9' },
  { name: 'Quad9', ip: '149.112.112.112' },
  { name: 'OpenDNS', ip: '208.67.222.222' },
  { name: 'OpenDNS', ip: '208.67.220.220' },
  { name: 'NextDNS', ip: '45.90.28.0' },
  { name: 'NextDNS', ip: '45.90.30.0' },
  { name: 'AdGuard', ip: '94.140.14.14' },
  { name: 'AdGuard', ip: '94.140.15.15' },
  { name: 'CleanBrowsing', ip: '185.228.168.9' },
  { name: 'CleanBrowsing', ip: '185.228.169.9' },
];

// Hostname suffixes for providers whose DoH endpoint IP isn't stable enough
// to hardcode — matched against sniffed TLS SNI (doh-detector.js) rather
// than blocked by IP here.
const DOH_SNI_PATTERNS = [
  'dns.google',
  'cloudflare-dns.com',
  'doh.opendns.com',
  'dns.quad9.net',
  'doh.cleanbrowsing.org',
  'dns.nextdns.io',
  'doh.dns.sb',
  'dns.adguard.com',
  'dns.adguard-dns.com',
];

function matchDohSni(hostname) {
  if (!hostname) return null;
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  for (const suffix of DOH_SNI_PATTERNS) {
    if (normalized === suffix || normalized.endsWith(`.${suffix}`)) return suffix;
  }
  return null;
}

function matchDohIp(ipAddress) {
  if (!ipAddress) return null;
  const hit = DOH_PROVIDER_IPS.find((provider) => provider.ip === ipAddress);
  return hit ? hit.name : null;
}

module.exports = { DOT_PORTS, DOH_PROVIDER_IPS, DOH_SNI_PATTERNS, matchDohSni, matchDohIp };

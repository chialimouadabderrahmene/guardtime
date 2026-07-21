'use strict';

const { matchVpnDomain, matchVpnPort, matchVpnPortDetectionOnly, matchVpnIp } = require('../src/vpn-patterns');

describe('matchVpnDomain', () => {
  it('matches an exact known VPN domain and returns its weight', () => {
    expect(matchVpnDomain('nordvpn.com')).toEqual({ provider: 'NordVPN', weight: 85 });
    expect(matchVpnDomain('mullvad.net')).toEqual({ provider: 'Mullvad', weight: 85 });
  });

  it('matches a subdomain of a known VPN domain', () => {
    expect(matchVpnDomain('api.nordvpn.com').provider).toBe('NordVPN');
    expect(matchVpnDomain('engage.cloudflareclient.com').provider).toBe('Cloudflare WARP');
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(matchVpnDomain('NordVPN.COM.').provider).toBe('NordVPN');
  });

  it('does not match an unrelated domain (non-exhaustive by design)', () => {
    expect(matchVpnDomain('example.com')).toBeNull();
  });

  it('does not false-positive on a domain that merely contains the pattern as a substring', () => {
    expect(matchVpnDomain('notnordvpn.com')).toBeNull();
  });

  it('returns null for a missing domain', () => {
    expect(matchVpnDomain(null)).toBeNull();
  });
});

describe('matchVpnPort', () => {
  it('matches known VPN protocol ports and returns their weight', () => {
    expect(matchVpnPort('udp', 51820)).toEqual({ provider: 'WireGuard', weight: 90 });
    expect(matchVpnPort('udp', 1194)).toEqual({ provider: 'OpenVPN', weight: 90 });
    expect(matchVpnPort('udp', 500).provider).toBe('IKEv2/IPsec');
  });

  it('does not match on the wrong protocol', () => {
    expect(matchVpnPort('tcp', 51820)).toBeNull();
  });

  it('does not match an unlisted port', () => {
    expect(matchVpnPort('udp', 12345)).toBeNull();
  });

  it('matches the expanded protocol signatures added for L2TP/PPTP/SoftEther/Outline/Tailscale/ZeroTier', () => {
    expect(matchVpnPort('udp', 1701).provider).toBe('L2TP');
    expect(matchVpnPort('tcp', 1723).provider).toBe('PPTP');
    expect(matchVpnPort('tcp', 992).provider).toBe('SoftEther');
    expect(matchVpnPort('tcp', 5555).provider).toBe('SoftEther');
    expect(matchVpnPort('udp', 41194).provider).toBe('Outline (Shadowsocks, common default)');
    expect(matchVpnPort('udp', 41641).provider).toBe('Tailscale');
    expect(matchVpnPort('udp', 9993).provider).toBe('ZeroTier');
  });

  it('every port-signature weight is within 0-100', () => {
    const { VPN_PORT_SIGNATURES } = require('../src/vpn-patterns');
    for (const sig of VPN_PORT_SIGNATURES) {
      expect(sig.weight).toBeGreaterThan(0);
      expect(sig.weight).toBeLessThanOrEqual(100);
    }
  });
});

describe('matchVpnPortDetectionOnly', () => {
  it('matches generic proxy ports, but only as a lower-weight detection-only signal', () => {
    expect(matchVpnPortDetectionOnly('tcp', 1080)).toEqual({ provider: 'SOCKS proxy', weight: 30 });
    expect(matchVpnPortDetectionOnly('tcp', 3128).provider).toBe('HTTP/HTTPS proxy (Squid default)');
    expect(matchVpnPortDetectionOnly('tcp', 8080).provider).toBe('HTTP/HTTPS proxy');
  });

  it('detection-only weights are lower than every auto-block-eligible port weight', () => {
    const { VPN_PORT_SIGNATURES, VPN_DETECTION_ONLY_PORT_SIGNATURES } = require('../src/vpn-patterns');
    const minBlockWeight = Math.min(...VPN_PORT_SIGNATURES.map((s) => s.weight));
    const maxDetectionOnlyWeight = Math.max(...VPN_DETECTION_ONLY_PORT_SIGNATURES.map((s) => s.weight));
    expect(maxDetectionOnlyWeight).toBeLessThan(minBlockWeight);
  });

  it('deliberately does not match port 443 — see the module comment on why', () => {
    expect(matchVpnPortDetectionOnly('tcp', 443)).toBeNull();
  });

  it('does not overlap with the auto-block-eligible matchVpnPort list', () => {
    expect(matchVpnPort('tcp', 1080)).toBeNull();
    expect(matchVpnPort('tcp', 8080)).toBeNull();
  });
});

describe('matchVpnIp', () => {
  it('matches an IP inside a known VPN provider range and returns its weight', () => {
    expect(matchVpnIp('162.159.192.10')).toEqual({ provider: 'Cloudflare WARP', weight: 85 });
  });

  it('matches an IP inside the Tailscale CGNAT range', () => {
    expect(matchVpnIp('100.64.1.5').provider).toBe('Tailscale');
    expect(matchVpnIp('100.127.255.254').provider).toBe('Tailscale');
  });

  it('does not match an IP outside all known ranges', () => {
    expect(matchVpnIp('8.8.8.8')).toBeNull();
  });

  it('returns null for a missing IP', () => {
    expect(matchVpnIp(null)).toBeNull();
  });
});

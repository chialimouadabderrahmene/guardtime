'use strict';

const { matchVpnDomain, matchVpnPort, matchVpnPortDetectionOnly, matchVpnIp } = require('../src/vpn-patterns');

describe('matchVpnDomain', () => {
  it('matches an exact known VPN domain', () => {
    expect(matchVpnDomain('nordvpn.com')).toBe('NordVPN');
    expect(matchVpnDomain('mullvad.net')).toBe('Mullvad');
  });

  it('matches a subdomain of a known VPN domain', () => {
    expect(matchVpnDomain('api.nordvpn.com')).toBe('NordVPN');
    expect(matchVpnDomain('engage.cloudflareclient.com')).toBe('Cloudflare WARP');
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(matchVpnDomain('NordVPN.COM.')).toBe('NordVPN');
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
  it('matches known VPN protocol ports', () => {
    expect(matchVpnPort('udp', 51820)).toBe('WireGuard');
    expect(matchVpnPort('udp', 1194)).toBe('OpenVPN');
    expect(matchVpnPort('udp', 500)).toBe('IKEv2/IPsec');
  });

  it('does not match on the wrong protocol', () => {
    expect(matchVpnPort('tcp', 51820)).toBeNull();
  });

  it('does not match an unlisted port', () => {
    expect(matchVpnPort('udp', 12345)).toBeNull();
  });

  it('matches the expanded protocol signatures added for L2TP/PPTP/SoftEther/Outline/Tailscale/ZeroTier', () => {
    expect(matchVpnPort('udp', 1701)).toBe('L2TP');
    expect(matchVpnPort('tcp', 1723)).toBe('PPTP');
    expect(matchVpnPort('tcp', 992)).toBe('SoftEther');
    expect(matchVpnPort('tcp', 5555)).toBe('SoftEther');
    expect(matchVpnPort('udp', 41194)).toBe('Outline (Shadowsocks, common default)');
    expect(matchVpnPort('udp', 41641)).toBe('Tailscale');
    expect(matchVpnPort('udp', 9993)).toBe('ZeroTier');
  });
});

describe('matchVpnPortDetectionOnly', () => {
  it('matches generic proxy ports, but only as a detection-only signal', () => {
    expect(matchVpnPortDetectionOnly('tcp', 1080)).toBe('SOCKS proxy');
    expect(matchVpnPortDetectionOnly('tcp', 3128)).toBe('HTTP/HTTPS proxy (Squid default)');
    expect(matchVpnPortDetectionOnly('tcp', 8080)).toBe('HTTP/HTTPS proxy');
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
  it('matches an IP inside a known VPN provider range', () => {
    expect(matchVpnIp('162.159.192.10')).toBe('Cloudflare WARP');
  });

  it('matches an IP inside the Tailscale CGNAT range', () => {
    expect(matchVpnIp('100.64.1.5')).toBe('Tailscale');
    expect(matchVpnIp('100.127.255.254')).toBe('Tailscale');
  });

  it('does not match an IP outside all known ranges', () => {
    expect(matchVpnIp('8.8.8.8')).toBeNull();
  });

  it('returns null for a missing IP', () => {
    expect(matchVpnIp(null)).toBeNull();
  });
});

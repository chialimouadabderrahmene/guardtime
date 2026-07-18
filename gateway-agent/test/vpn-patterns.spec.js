'use strict';

const { matchVpnDomain, matchVpnPort, matchVpnIp } = require('../src/vpn-patterns');

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
});

describe('matchVpnIp', () => {
  it('matches an IP inside a known VPN provider range', () => {
    expect(matchVpnIp('162.159.192.10')).toBe('Cloudflare WARP');
  });

  it('does not match an IP outside all known ranges', () => {
    expect(matchVpnIp('8.8.8.8')).toBeNull();
  });

  it('returns null for a missing IP', () => {
    expect(matchVpnIp(null)).toBeNull();
  });
});

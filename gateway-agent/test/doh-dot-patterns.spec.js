'use strict';

const { DOT_PORTS, DOH_PROVIDER_IPS, DOH_SNI_PATTERNS, matchDohSni, matchDohIp } = require('../src/doh-dot-patterns');

describe('DOT_PORTS', () => {
  it('includes the standard DNS-over-TLS port', () => {
    expect(DOT_PORTS).toContain(853);
  });
});

describe('matchDohIp', () => {
  it('matches a known built-in provider IP', () => {
    expect(matchDohIp('1.1.1.1')).toBe('Cloudflare');
    expect(matchDohIp('8.8.8.8')).toBe('Google');
  });

  it('returns null for an unlisted IP with no reputation list supplied', () => {
    expect(matchDohIp('93.184.216.34')).toBeNull();
  });

  it('returns null for a missing IP', () => {
    expect(matchDohIp(null)).toBeNull();
  });

  it('matches an operator-supplied reputation IP not in the built-in list', () => {
    expect(matchDohIp('203.0.113.50', ['203.0.113.50'])).toBe('operator-reputation-list');
  });

  it('prefers the built-in provider name over the reputation label when an IP is in both', () => {
    expect(matchDohIp('1.1.1.1', ['1.1.1.1'])).toBe('Cloudflare');
  });

  it('does not match an IP absent from both the built-in and reputation lists', () => {
    expect(matchDohIp('203.0.113.99', ['203.0.113.50'])).toBeNull();
  });

  it('every built-in provider IP is actually reachable via matchDohIp', () => {
    for (const provider of DOH_PROVIDER_IPS) {
      expect(matchDohIp(provider.ip)).toBe(provider.name);
    }
  });
});

describe('matchDohSni', () => {
  it('matches an exact known DoH hostname', () => {
    expect(matchDohSni('dns.google')).toBe('dns.google');
    expect(matchDohSni('cloudflare-dns.com')).toBe('cloudflare-dns.com');
  });

  it('matches a subdomain of a known DoH hostname', () => {
    expect(matchDohSni('mozilla.cloudflare-dns.com')).toBe('cloudflare-dns.com');
  });

  it('is case-insensitive and tolerates a trailing dot', () => {
    expect(matchDohSni('DNS.GOOGLE.')).toBe('dns.google');
  });

  it('returns null for an unrelated hostname with no reputation list supplied', () => {
    expect(matchDohSni('example.com')).toBeNull();
  });

  it('does not false-positive on a hostname that merely contains the pattern as a substring', () => {
    expect(matchDohSni('notdns.google.evil.com')).toBeNull();
  });

  it('returns null for a missing hostname', () => {
    expect(matchDohSni(null)).toBeNull();
  });

  it('matches an operator-supplied reputation domain not in the built-in list', () => {
    expect(matchDohSni('doh.myselfhosted.example', ['myselfhosted.example'])).toBe('myselfhosted.example');
  });

  it('matches every built-in SNI pattern via matchDohSni', () => {
    for (const suffix of DOH_SNI_PATTERNS) {
      expect(matchDohSni(suffix)).toBe(suffix);
    }
  });
});

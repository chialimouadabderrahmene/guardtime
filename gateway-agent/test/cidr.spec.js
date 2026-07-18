'use strict';

const { ipToInt, ipInCidr } = require('../src/cidr');

describe('ipToInt', () => {
  it('converts a dotted-quad IPv4 address to an integer', () => {
    expect(ipToInt('0.0.0.0')).toBe(0);
    expect(ipToInt('255.255.255.255')).toBe(4294967295);
    expect(ipToInt('192.168.1.1')).toBe((192 * 2 ** 24) + (168 * 2 ** 16) + (1 * 2 ** 8) + 1);
  });

  it('returns null for malformed input', () => {
    expect(ipToInt('not-an-ip')).toBeNull();
    expect(ipToInt('1.2.3')).toBeNull();
    expect(ipToInt('1.2.3.256')).toBeNull();
    expect(ipToInt('1.2.3.4.5')).toBeNull();
  });
});

describe('ipInCidr', () => {
  it('matches an address inside a /24 range', () => {
    expect(ipInCidr('162.159.192.50', '162.159.192.0/24')).toBe(true);
  });

  it('rejects an address outside the range', () => {
    expect(ipInCidr('162.159.193.1', '162.159.192.0/24')).toBe(false);
  });

  it('handles a /32 host route (exact match only)', () => {
    expect(ipInCidr('10.0.0.5', '10.0.0.5/32')).toBe(true);
    expect(ipInCidr('10.0.0.6', '10.0.0.5/32')).toBe(false);
  });

  it('handles a /0 range (matches everything)', () => {
    expect(ipInCidr('8.8.8.8', '0.0.0.0/0')).toBe(true);
  });

  it('returns false for malformed IP or CIDR input rather than throwing', () => {
    expect(ipInCidr('not-an-ip', '10.0.0.0/8')).toBe(false);
    expect(ipInCidr('10.0.0.1', 'not-a-cidr/8')).toBe(false);
  });
});

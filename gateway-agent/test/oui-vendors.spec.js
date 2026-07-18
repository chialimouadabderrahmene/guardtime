'use strict';

const { lookupVendor } = require('../src/oui-vendors');

describe('lookupVendor', () => {
  it('resolves a known OUI prefix regardless of case', () => {
    expect(lookupVendor('3C:06:30:AA:BB:CC')).toBe('Apple');
    expect(lookupVendor('3c:06:30:aa:bb:cc')).toBe('Apple');
  });

  it('resolves multiple distinct vendors', () => {
    expect(lookupVendor('8c:79:f5:11:22:33')).toBe('Samsung');
    expect(lookupVendor('b8:27:eb:11:22:33')).toBe('Raspberry Pi Foundation');
  });

  it('returns null for an unrecognized prefix (non-exhaustive table)', () => {
    expect(lookupVendor('00:00:00:00:00:00')).toBeNull();
  });

  it('returns null for a missing MAC', () => {
    expect(lookupVendor(null)).toBeNull();
    expect(lookupVendor(undefined)).toBeNull();
  });
});

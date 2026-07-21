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

  it('resolves the router-vendor OUIs added for the integration expansion', () => {
    expect(lookupVendor('00:1d:aa:11:22:33')).toBe('DrayTek');
    expect(lookupVendor('00:11:32:11:22:33')).toBe('Synology');
    expect(lookupVendor('00:16:01:11:22:33')).toBe('Buffalo');
    expect(lookupVendor('00:e0:fc:11:22:33')).toBe('Huawei');
    expect(lookupVendor('4c:1f:cc:11:22:33')).toBe('Huawei');
  });

  it('returns null for an unrecognized prefix (non-exhaustive table)', () => {
    expect(lookupVendor('00:00:00:00:00:00')).toBeNull();
  });

  it('returns null for a missing MAC', () => {
    expect(lookupVendor(null)).toBeNull();
    expect(lookupVendor(undefined)).toBeNull();
  });
});

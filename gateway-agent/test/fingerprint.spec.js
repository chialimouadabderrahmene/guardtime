'use strict';

jest.mock('../src/dhcp-leases');
jest.mock('../src/oui-vendors');
jest.mock('../src/os-hint');

const { readDhcpLeases } = require('../src/dhcp-leases');
const { lookupVendor } = require('../src/oui-vendors');
const { detectOsHint } = require('../src/os-hint');
const { enrichWithFingerprint } = require('../src/fingerprint');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('enrichWithFingerprint', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the input unchanged (short-circuits) when nothing was discovered', async () => {
    const result = await enrichWithFingerprint([], {}, fakeLogger());
    expect(result).toEqual([]);
    expect(readDhcpLeases).not.toHaveBeenCalled();
  });

  it('merges lease hostname/client-id, vendor OUI, and OS hint onto each discovered device', async () => {
    readDhcpLeases.mockResolvedValue(
      new Map([['aa:bb:cc:dd:ee:ff', { hostname: 'iphone-13', dhcpClientId: 'client-1' }]]),
    );
    lookupVendor.mockReturnValue('Apple');
    detectOsHint.mockResolvedValue('unix-like');

    const result = await enrichWithFingerprint(
      [{ ipAddress: '192.168.1.50', macAddress: 'aa:bb:cc:dd:ee:ff' }],
      { enableOsHint: true },
      fakeLogger(),
    );

    expect(result).toEqual([
      {
        ipAddress: '192.168.1.50',
        macAddress: 'aa:bb:cc:dd:ee:ff',
        hostname: 'iphone-13',
        dhcpClientId: 'client-1',
        vendorOui: 'Apple',
        osHint: 'unix-like',
      },
    ]);
  });

  it('fills in nulls when no lease entry, vendor, or OS hint is available', async () => {
    readDhcpLeases.mockResolvedValue(new Map());
    lookupVendor.mockReturnValue(null);
    detectOsHint.mockResolvedValue(null);

    const result = await enrichWithFingerprint(
      [{ ipAddress: '192.168.1.60', macAddress: 'ff:ff:ff:ff:ff:ff' }],
      {},
      fakeLogger(),
    );

    expect(result[0]).toEqual({
      ipAddress: '192.168.1.60',
      macAddress: 'ff:ff:ff:ff:ff:ff',
      hostname: null,
      dhcpClientId: null,
      vendorOui: null,
      osHint: null,
    });
  });

  it('enriches multiple devices independently', async () => {
    readDhcpLeases.mockResolvedValue(
      new Map([['aa:aa:aa:aa:aa:aa', { hostname: 'device-a', dhcpClientId: null }]]),
    );
    lookupVendor.mockImplementation((mac) => (mac === 'aa:aa:aa:aa:aa:aa' ? 'Vendor A' : null));
    detectOsHint.mockResolvedValue(null);

    const result = await enrichWithFingerprint(
      [
        { ipAddress: '192.168.1.1', macAddress: 'aa:aa:aa:aa:aa:aa' },
        { ipAddress: '192.168.1.2', macAddress: 'bb:bb:bb:bb:bb:bb' },
      ],
      {},
      fakeLogger(),
    );

    expect(result).toHaveLength(2);
    expect(result[0].hostname).toBe('device-a');
    expect(result[0].vendorOui).toBe('Vendor A');
    expect(result[1].hostname).toBeNull();
    expect(result[1].vendorOui).toBeNull();
  });
});

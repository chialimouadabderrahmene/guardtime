'use strict';

jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));
const fs = require('node:fs/promises');

const { parseDhcpLeases, readDhcpLeases } = require('../src/dhcp-leases');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('parseDhcpLeases', () => {
  it('parses a standard dnsmasq lease line into hostname + client id', () => {
    const contents = '1700000000 aa:bb:cc:dd:ee:ff 192.168.1.50 iphone-13 01:aa:bb:cc:dd:ee:ff\n';
    const leases = parseDhcpLeases(contents);
    expect(leases.get('aa:bb:cc:dd:ee:ff')).toEqual({ hostname: 'iphone-13', dhcpClientId: '01:aa:bb:cc:dd:ee:ff' });
  });

  it('treats "*" as an absent hostname/client-id, per dnsmasq convention', () => {
    const contents = '1700000000 11:22:33:44:55:66 192.168.1.51 * *\n';
    const leases = parseDhcpLeases(contents);
    expect(leases.get('11:22:33:44:55:66')).toEqual({ hostname: null, dhcpClientId: null });
  });

  it('lowercases the MAC key and skips blank/malformed lines', () => {
    const contents = '\n1700000000 AA:BB:CC:DD:EE:00 192.168.1.52 laptop *\nnot-a-lease-line\n';
    const leases = parseDhcpLeases(contents);
    expect(leases.get('aa:bb:cc:dd:ee:00')).toEqual({ hostname: 'laptop', dhcpClientId: null });
    expect(leases.size).toBe(1);
  });
});

describe('readDhcpLeases', () => {
  beforeEach(() => {
    fs.readFile.mockReset();
  });

  it('returns an empty map when no lease file is configured', async () => {
    const leases = await readDhcpLeases({ dhcpLeasesFile: '' }, fakeLogger());
    expect(leases.size).toBe(0);
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('returns parsed leases when the file reads successfully', async () => {
    fs.readFile.mockResolvedValue('1700000000 aa:bb:cc:dd:ee:ff 192.168.1.50 iphone-13 *\n');
    const leases = await readDhcpLeases({ dhcpLeasesFile: '/var/lib/misc/dnsmasq.leases' }, fakeLogger());
    expect(leases.get('aa:bb:cc:dd:ee:ff')).toEqual({ hostname: 'iphone-13', dhcpClientId: null });
  });

  it('never throws when the lease file is missing/unreadable (best-effort)', async () => {
    fs.readFile.mockRejectedValue(new Error('ENOENT'));
    const logger = fakeLogger();
    const leases = await readDhcpLeases({ dhcpLeasesFile: '/does/not/exist' }, logger);
    expect(leases.size).toBe(0);
    expect(logger.debug).toHaveBeenCalled();
  });
});

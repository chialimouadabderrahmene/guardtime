'use strict';

const { resolvePolicyTarget, discoverDevices } = require('../src/device-discovery');

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

describe('resolvePolicyTarget', () => {
  it('resolves ip/mac from a discovered device match by mac address', () => {
    const target = resolvePolicyTarget(
      { deviceId: 'dev-1', name: 'Phone', action: 'BLOCK', reason: 'BEDTIME', macAddress: 'AA:BB:CC:DD:EE:FF' },
      [{ ipAddress: '192.168.1.50', macAddress: 'aa:bb:cc:dd:ee:ff' }],
    );

    expect(target).toEqual({
      deviceId: 'dev-1',
      name: 'Phone',
      action: 'BLOCK',
      reason: 'BEDTIME',
      ipAddress: '192.168.1.50',
      ipv6Address: null,
      macAddress: 'aa:bb:cc:dd:ee:ff',
      vpnBlock: false,
      quicBlock: false,
      bandwidthLimits: [],
    });
  });

  it('prefers a discovered IPv6 address over one from the policy payload', () => {
    const target = resolvePolicyTarget(
      { deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', macAddress: 'AA:BB:CC:DD:EE:FF', ipv6Address: '2001:db8::9999' },
      [{ macAddress: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }],
    );
    expect(target.ipv6Address).toBe('2001:db8::1');
  });

  it('falls back to the policy-provided ipv6Address when no discovery match exists', () => {
    const target = resolvePolicyTarget(
      { deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', ipv6Address: '2001:db8::9999' },
      [],
    );
    expect(target.ipv6Address).toBe('2001:db8::9999');
  });

  it('passes through the quicBlock policy flag when present (Layer 6)', () => {
    const target = resolvePolicyTarget(
      { deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', macAddress: 'AA:BB:CC:DD:EE:FF', quicBlock: true },
      [],
    );
    expect(target.quicBlock).toBe(true);
  });

  it('passes through the vpnBlock policy flag when present (Layer 5)', () => {
    const target = resolvePolicyTarget(
      { deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', macAddress: 'AA:BB:CC:DD:EE:FF', vpnBlock: true },
      [],
    );
    expect(target.vpnBlock).toBe(true);
  });

  it('defaults vpnBlock to false when the policy omits it', () => {
    const target = resolvePolicyTarget({ deviceId: 'dev-1', name: 'Phone', action: 'ALLOW' }, []);
    expect(target.vpnBlock).toBe(false);
  });

  it('falls back to the policy-provided ipAddress/dnsSourceIp when no discovery match exists', () => {
    const target = resolvePolicyTarget(
      { deviceId: 'dev-1', name: 'Phone', action: 'BLOCK', ipAddress: '10.0.0.5', dnsSourceIp: '10.0.0.6' },
      [],
    );
    expect(target.ipAddress).toBe('10.0.0.5');
  });
});

describe('discoverDevices — IPv6 neighbor-table parsing', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  function mockIpNeigh(stdout) {
    execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
      const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
      cb(null, { stdout, stderr: '' });
    });
  }

  it('merges a device\'s IPv4 and IPv6 neighbor-table lines into one record', async () => {
    mockIpNeigh(
      '192.168.1.50 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n' +
        '2001:db8::1234 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n',
    );

    const devices = await discoverDevices({ ipBin: 'ip' }, { warn: jest.fn() });

    expect(devices).toEqual([
      { macAddress: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1234' },
    ]);
  });

  it('skips IPv6 link-local (fe80::) neighbor entries', async () => {
    mockIpNeigh(
      '192.168.1.50 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n' +
        'fe80::1234:5678:9abc:def0 dev eth0 lladdr aa:bb:cc:dd:ee:ff STALE\n',
    );

    const devices = await discoverDevices({ ipBin: 'ip' }, { warn: jest.fn() });

    expect(devices).toEqual([{ macAddress: 'aa:bb:cc:dd:ee:ff', ipAddress: '192.168.1.50' }]);
  });

  it('handles a device with only an IPv6 neighbor entry (no v4 line yet)', async () => {
    mockIpNeigh('2001:db8::9 dev eth0 lladdr 11:22:33:44:55:66 REACHABLE\n');

    const devices = await discoverDevices({ ipBin: 'ip' }, { warn: jest.fn() });

    expect(devices).toEqual([{ macAddress: '11:22:33:44:55:66', ipv6Address: '2001:db8::9' }]);
  });
});

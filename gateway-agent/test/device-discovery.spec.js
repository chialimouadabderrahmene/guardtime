'use strict';

const { resolvePolicyTarget } = require('../src/device-discovery');

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
      macAddress: 'aa:bb:cc:dd:ee:ff',
      vpnBlock: false,
      quicBlock: false,
      bandwidthLimits: [],
    });
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

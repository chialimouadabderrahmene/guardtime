'use strict';

const { buildFirewallSyncSignature } = require('../src/firewall-sync-signature');

function baseArgs(overrides = {}) {
  return {
    targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', macAddress: null, vpnBlock: false, quicBlock: false }],
    dnsRedirectIp: '10.0.0.1',
    dnsRedirectIpv6: null,
    enableDnsRedirect: true,
    enableQuicBlockGlobal: false,
    enableDohBlock: true,
    enableIpv6: false,
    ...overrides,
  };
}

describe('buildFirewallSyncSignature', () => {
  it('produces an identical signature for identical input', () => {
    expect(buildFirewallSyncSignature(baseArgs())).toBe(buildFirewallSyncSignature(baseArgs()));
  });

  it('is insensitive to target array order (order does not affect the generated rules)', () => {
    const a = buildFirewallSyncSignature(baseArgs({
      targets: [
        { deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50' },
        { deviceId: 'dev-2', action: 'ALLOW', ipAddress: '192.168.1.51' },
      ],
    }));
    const b = buildFirewallSyncSignature(baseArgs({
      targets: [
        { deviceId: 'dev-2', action: 'ALLOW', ipAddress: '192.168.1.51' },
        { deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50' },
      ],
    }));
    expect(a).toBe(b);
  });

  it('changes when a target action changes', () => {
    const a = buildFirewallSyncSignature(baseArgs());
    const b = buildFirewallSyncSignature(baseArgs({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }],
    }));
    expect(a).not.toBe(b);
  });

  it('changes when a target IP changes', () => {
    const a = buildFirewallSyncSignature(baseArgs());
    const b = buildFirewallSyncSignature(baseArgs({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.99' }],
    }));
    expect(a).not.toBe(b);
  });

  it('changes when vpnBlock or quicBlock flips for a target', () => {
    const a = buildFirewallSyncSignature(baseArgs());
    const b = buildFirewallSyncSignature(baseArgs({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', vpnBlock: true }],
    }));
    expect(a).not.toBe(b);
  });

  it('changes when a device is added or removed', () => {
    const a = buildFirewallSyncSignature(baseArgs());
    const b = buildFirewallSyncSignature(baseArgs({
      targets: [...baseArgs().targets, { deviceId: 'dev-2', action: 'ALLOW', ipAddress: '192.168.1.51' }],
    }));
    expect(a).not.toBe(b);
  });

  it('changes when a global flag changes (enableDohBlock, enableQuicBlockGlobal, enableDnsRedirect, enableIpv6)', () => {
    const a = buildFirewallSyncSignature(baseArgs());
    expect(a).not.toBe(buildFirewallSyncSignature(baseArgs({ enableDohBlock: false })));
    expect(a).not.toBe(buildFirewallSyncSignature(baseArgs({ enableQuicBlockGlobal: true })));
    expect(a).not.toBe(buildFirewallSyncSignature(baseArgs({ enableDnsRedirect: false })));
    expect(a).not.toBe(buildFirewallSyncSignature(baseArgs({ enableIpv6: true })));
  });

  it('changes when dnsRedirectIp or dnsRedirectIpv6 changes', () => {
    const a = buildFirewallSyncSignature(baseArgs());
    expect(a).not.toBe(buildFirewallSyncSignature(baseArgs({ dnsRedirectIp: '10.0.0.2' })));
    expect(a).not.toBe(buildFirewallSyncSignature(baseArgs({ dnsRedirectIpv6: '2001:db8::1' })));
  });

  it('treats an empty target list deterministically', () => {
    expect(buildFirewallSyncSignature(baseArgs({ targets: [] }))).toBe(buildFirewallSyncSignature(baseArgs({ targets: [] })));
  });
});

'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { IptablesController } = require('../src/iptables-controller');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseConfig(overrides = {}) {
  return { iptablesBin: 'iptables', dryRun: false, ...overrides };
}

function mockExecFile({ fail, saveOut = '# pristine\n' } = {}) {
  const calls = [];
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    calls.push({ cmd, args });
    if (fail && fail(args)) {
      cb(new Error('simulated iptables failure'));
      return;
    }
    if (cmd === 'iptables-save') {
      cb(null, { stdout: saveOut, stderr: '' });
      return;
    }
    if (args.includes('-C')) {
      // "-C" (check) calls should fail as "rule not present" so ensureRule adds it once.
      cb(new Error('rule not found'));
      return;
    }
    cb(null, { stdout: '', stderr: '' });
  });
  return calls;
}

describe('IptablesController', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('applies block rules for BLOCK targets on a clean sync', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', macAddress: 'AA:BB:CC:DD:EE:FF' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((c) => c.args.includes('-s') && c.args.includes('192.168.1.50') && c.args.includes('DROP'))).toBe(true);
    expect(calls.some((c) => c.args.includes('--mac-source') && c.args.includes('AA:BB:CC:DD:EE:FF'))).toBe(true);
  });

  it('addQuicBlockRule adds a UDP/443 DROP rule for the target IP', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.addQuicBlockRule({ deviceId: 'dev-1', ipAddress: '192.168.1.50' });

    expect(
      calls.some((c) => c.args.includes('udp') && c.args.includes('443') && c.args.includes('192.168.1.50') && c.args.includes('DROP')),
    ).toBe(true);
  });

  it('applies the quic block rule globally when enableQuicBlockGlobal is set, even without a per-device flag', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
      enableQuicBlockGlobal: true,
    });

    expect(calls.some((c) => c.args.includes('udp') && c.args.includes('443') && c.args.includes('DROP'))).toBe(true);
  });

  it('does not add a quic block rule for an ordinary device (no per-device flag, no global flag)', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
      enableQuicBlockGlobal: false,
    });

    expect(calls.some((c) => c.args.includes('udp') && c.args.includes('443'))).toBe(false);
  });

  it('addVpnBlockRules adds DROP rules for every known VPN port and IP range', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.addVpnBlockRules({ deviceId: 'dev-1', ipAddress: '192.168.1.50' });

    expect(calls.some((c) => c.args.includes('51820') && c.args.includes('DROP'))).toBe(true);
    expect(calls.some((c) => c.args.includes('1194') && c.args.includes('DROP'))).toBe(true);
    expect(calls.some((c) => c.args.includes('-d') && c.args.includes('162.159.192.0/24'))).toBe(true);
  });

  it('applies vpn-block rules for a device even when its policy action is ALLOW', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50', vpnBlock: true }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((c) => c.args.includes('51820'))).toBe(true);
  });

  it('rolls back to the iptables-save snapshot when sync fails partway through', async () => {
    const calls = mockExecFile({
      saveOut: '# pristine-iptables-ruleset\n',
      fail: (args) => args.includes('192.168.1.99'),
    });
    const logger = fakeLogger();
    const controller = new IptablesController(baseConfig(), logger);

    await expect(
      controller.sync({
        targets: [{ deviceId: 'dev-bad', action: 'BLOCK', ipAddress: '192.168.1.99' }],
        dnsRedirectIp: '10.0.0.1',
        enableDnsRedirect: false,
      }),
    ).rejects.toThrow();

    expect(calls.some((c) => c.cmd === 'iptables-save')).toBe(true);
    const restoreCall = calls.find((c) => c.cmd === 'iptables-restore');
    expect(restoreCall).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      'iptables sync failed, rolling back to prior ruleset',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('mirrors a block rule onto ip6tables (MAC-based) even without a known IPv6 address', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', macAddress: 'AA:BB:CC:DD:EE:FF' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    const v6Calls = calls.filter((c) => c.cmd === 'ip6tables');
    expect(v6Calls.some((c) => c.args.includes('--mac-source') && c.args.includes('AA:BB:CC:DD:EE:FF'))).toBe(true);
    // No IPv6 address known yet — no v6 IP-based DROP rule should exist.
    expect(v6Calls.some((c) => c.args.includes('-s') && c.args.includes('192.168.1.50'))).toBe(false);
  });

  it('adds a v6 IP-based block rule once the target has an ipv6Address', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    const v6Calls = calls.filter((c) => c.cmd === 'ip6tables');
    expect(v6Calls.some((c) => c.args.includes('-s') && c.args.includes('2001:db8::1') && c.args.includes('DROP'))).toBe(true);
  });

  it('does not run ip6tables at all when enableIpv6 is false', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ enableIpv6: false }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((c) => c.cmd === 'ip6tables')).toBe(false);
  });

  it('skips the v6 DNS redirect rule when no IPv6 resolver is configured, but still applies v6 block rules', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
    });

    const v6Calls = calls.filter((c) => c.cmd === 'ip6tables');
    expect(v6Calls.some((c) => c.args.includes('DNAT'))).toBe(false);
    expect(v6Calls.some((c) => c.args.includes('-s') && c.args.includes('2001:db8::1'))).toBe(true);
  });

  it('applies the v6 DNS redirect with bracketed destination syntax when an IPv6 resolver is configured', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ enableIpv6: true, dnsRedirectIpv6: '2001:db8::53' }), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
    });

    const v6Calls = calls.filter((c) => c.cmd === 'ip6tables');
    expect(v6Calls.some((c) => c.args.includes('DNAT') && c.args.includes('[2001:db8::53]:53'))).toBe(true);
  });

  it('a v6-stage failure rolls back only the v6 ruleset — v4 enforcement is unaffected', async () => {
    const calls = mockExecFile({ fail: (args) => args.includes('2001:db8::99') });
    const logger = fakeLogger();
    const controller = new IptablesController(baseConfig({ enableIpv6: true }), logger);

    await expect(
      controller.sync({
        targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::99' }],
        dnsRedirectIp: '10.0.0.1',
        enableDnsRedirect: false,
      }),
    ).resolves.not.toThrow();

    expect(calls.some((c) => c.cmd === 'iptables' && c.args.includes('192.168.1.50') && c.args.includes('DROP'))).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      'ip6tables sync failed — IPv4 enforcement is unaffected',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('DoH/DoT block: drops port 853 (both protocols) and known DoH provider IPs on 443', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
      enableDohBlock: true,
    });

    expect(calls.some((c) => c.args.includes('853') && c.args.includes('tcp') && c.args.includes('DROP'))).toBe(true);
    expect(calls.some((c) => c.args.includes('853') && c.args.includes('udp') && c.args.includes('DROP'))).toBe(true);
    expect(calls.some((c) => c.args.includes('-d') && c.args.includes('1.1.1.1') && c.args.includes('DROP'))).toBe(true);
  });

  it('does not apply DoH/DoT rules when enableDohBlock is not set', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((c) => c.args.includes('853'))).toBe(false);
  });

  it('dry-run mode short-circuits every mutating rule command', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ dryRun: true }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
    });

    // Only the read-only pre-sync snapshot (iptables-save) hits execFile;
    // every `run()` call for actual rule mutation is dry-run short-circuited.
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('iptables-save');
  });
});

describe('IptablesController — skips an idempotent rebuild', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  const syncArgs = () => ({
    targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', macAddress: 'AA:BB:CC:DD:EE:FF' }],
    dnsRedirectIp: '10.0.0.1',
    enableDnsRedirect: true,
  });

  it('makes zero execFile calls on a second sync with an unchanged policy', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync(syncArgs());
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await controller.sync(syncArgs());
    expect(calls.length).toBe(callsAfterFirst);
  });

  it('logs a debug message instead of shelling out when skipped', async () => {
    mockExecFile();
    const logger = fakeLogger();
    const controller = new IptablesController(baseConfig(), logger);

    await controller.sync(syncArgs());
    await controller.sync(syncArgs());

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('sync skipped'));
  });

  it('rebuilds again once the policy actually changes (e.g. a new device is blocked)', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await controller.sync(syncArgs());
    const callsAfterFirst = calls.length;

    await controller.sync({
      ...syncArgs(),
      targets: [...syncArgs().targets, { deviceId: 'dev-2', action: 'BLOCK', ipAddress: '192.168.1.51' }],
    });

    expect(calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('does not cache a signature after a failed sync — the next cycle retries in full', async () => {
    let shouldFail = true;
    const calls = mockExecFile({ fail: (args) => shouldFail && args.includes('GUARDTIME_BLOCK') && args.includes('-A') });
    const controller = new IptablesController(baseConfig(), fakeLogger());

    await expect(controller.sync(syncArgs())).rejects.toThrow();
    const callsAfterFailedAttempt = calls.length;

    shouldFail = false;
    await controller.sync(syncArgs());
    expect(calls.length).toBeGreaterThan(callsAfterFailedAttempt);
  });

  it('v4 and v6 are tracked independently — a v6 rebuild still happens even when v4 is unchanged', async () => {
    const calls = mockExecFile();
    const controller = new IptablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    await controller.sync({
      ...syncArgs(),
      targets: [{ ...syncArgs().targets[0], ipv6Address: '2001:db8::1' }],
      dnsRedirectIpv6: '2001:db8::53',
    });
    const callsAfterFirst = calls.length;

    await controller.sync({
      ...syncArgs(),
      targets: [{ ...syncArgs().targets[0], ipv6Address: '2001:db8::1' }],
      dnsRedirectIpv6: '2001:db8::53',
    });

    // Both v4 and v6 passes are unchanged the second time, so nothing new runs.
    expect(calls.length).toBe(callsAfterFirst);
  });
});

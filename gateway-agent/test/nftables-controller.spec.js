'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { NftablesController } = require('../src/nftables-controller');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseConfig(overrides = {}) {
  return { nftBin: 'nft', dryRun: false, ...overrides };
}

// Records every invocation and answers success by default. Pass a
// `fail(args)` predicate to make a specific call reject, to exercise the
// rollback path.
function mockExecFile({ fail, snapshotOut = '# snapshot\n' } = {}) {
  const calls = [];
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    calls.push(args);
    if (fail && fail(args)) {
      cb(new Error('simulated nft failure'));
      return;
    }
    if (args[0] === 'list' && args[1] === 'ruleset') {
      cb(null, { stdout: snapshotOut, stderr: '' });
      return;
    }
    cb(null, { stdout: '', stderr: '' });
  });
  return calls;
}

describe('NftablesController', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('creates the guardtime table/chain and flushes it before applying rules', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({ targets: [], dnsRedirectIp: '10.0.0.1', enableDnsRedirect: false });

    expect(calls).toContainEqual(['add', 'table', 'inet', 'guardtime']);
    expect(calls.some((args) => args[0] === 'add' && args[1] === 'chain' && args[3] === 'guardtime')).toBe(true);
    expect(calls).toContainEqual(['flush', 'chain', 'inet', 'guardtime', 'block']);
  });

  it('adds drop rules for blocked targets keyed by ip and mac', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [
        { deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', macAddress: 'AA:BB:CC:DD:EE:FF' },
        { deviceId: 'dev-2', action: 'ALLOW', ipAddress: '192.168.1.60' },
      ],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    const ipRule = calls.find((args) => args.includes('saddr') && args.includes('192.168.1.50'));
    const macRule = calls.find((args) => args.includes('ether'));
    expect(ipRule).toBeDefined();
    expect(macRule).toBeDefined();
    expect(calls.some((args) => args.includes('192.168.1.60'))).toBe(false);
  });

  it('sets up DNS redirect NAT rules when enabled', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({ targets: [], dnsRedirectIp: '10.0.0.9', enableDnsRedirect: true });

    expect(calls).toContainEqual(['add', 'table', 'ip', 'guardtime_nat']);
    expect(calls.some((args) => args.includes('dnat') && args.includes('10.0.0.9'))).toBe(true);
  });

  it('addQuicBlockRule adds a UDP/443 drop rule for the target IP', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.addQuicBlockRule({ deviceId: 'dev-1', ipAddress: '192.168.1.50' });

    expect(calls.some((args) => args.includes('udp') && args.includes('443') && args.includes('192.168.1.50'))).toBe(true);
  });

  it('applies the quic block rule globally when enableQuicBlockGlobal is set, even without a per-device flag', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
      enableQuicBlockGlobal: true,
    });

    expect(calls.some((args) => args.includes('udp') && args.includes('443') && args.includes('drop'))).toBe(true);
  });

  it('does not add a quic block rule for an ordinary device (no per-device flag, no global flag)', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
      enableQuicBlockGlobal: false,
    });

    expect(calls.some((args) => args.includes('udp') && args.includes('443'))).toBe(false);
  });

  it('addVpnBlockRules adds drop rules for every known VPN port and IP range', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.addVpnBlockRules({ deviceId: 'dev-1', ipAddress: '192.168.1.50' });

    expect(calls.some((args) => args.includes('51820') && args.includes('drop'))).toBe(true);
    expect(calls.some((args) => args.includes('1194') && args.includes('drop'))).toBe(true);
    expect(calls.some((args) => args.includes('daddr') && args.includes('162.159.192.0/24'))).toBe(true);
  });

  it('applies vpn-block rules for a device even when its policy action is ALLOW', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50', vpnBlock: true }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((args) => args.includes('51820'))).toBe(true);
  });

  it('rolls back to the pre-sync snapshot when a rule application fails', async () => {
    const calls = mockExecFile({
      snapshotOut: '# pristine-ruleset\n',
      fail: (args) => args.includes('192.168.1.99'),
    });
    const logger = fakeLogger();
    const controller = new NftablesController(baseConfig(), logger);

    await expect(
      controller.sync({
        targets: [{ deviceId: 'dev-bad', action: 'BLOCK', ipAddress: '192.168.1.99' }],
        dnsRedirectIp: '10.0.0.1',
        enableDnsRedirect: false,
      }),
    ).rejects.toThrow();

    expect(calls).toContainEqual(['list', 'ruleset']);
    const restoreCall = calls.find((args) => args[0] === '-f');
    expect(restoreCall).toBeDefined();
    expect(logger.error).toHaveBeenCalledWith(
      'nftables sync failed, rolling back to prior ruleset',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('adds an ip6 saddr block rule for a target with a known IPv6 address, plus a family-agnostic mac rule', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1', macAddress: 'aa:bb:cc:dd:ee:ff' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((args) => args.includes('ip6') && args.includes('saddr') && args.includes('2001:db8::1'))).toBe(true);
    expect(calls.some((args) => args.includes('ether') && args.includes('saddr') && args.includes('aa:bb:cc:dd:ee:ff'))).toBe(true);
  });

  it('does not add an ip6 rule when enableIpv6 is false, even with a known IPv6 address', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig({ enableIpv6: false }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((args) => args.includes('ip6'))).toBe(false);
  });

  it('sets up a separate ip6-family NAT table for the v6 DNS redirect when a v6 resolver is configured', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig({ enableIpv6: true, dnsRedirectIpv6: '2001:db8::53' }), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
    });

    expect(calls.some((args) => args.includes('ip6') && args.includes('guardtime_nat6'))).toBe(true);
    expect(calls.some((args) => args.includes('dnat') && args.includes('2001:db8::53'))).toBe(true);
  });

  it('skips the v6 NAT table entirely when no v6 resolver is configured', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
    });

    expect(calls.some((args) => args.includes('guardtime_nat6'))).toBe(false);
  });

  it('DoH/DoT: adds a port-853 drop rule and known DoH provider IP drop rules when enableDohBlock is set', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
      enableDohBlock: true,
    });

    expect(calls.some((args) => args.includes('853') && args.includes('tcp'))).toBe(true);
    expect(calls.some((args) => args.includes('853') && args.includes('udp'))).toBe(true);
    expect(calls.some((args) => args.includes('daddr') && args.includes('1.1.1.1'))).toBe(true);
  });

  it('does not add DoH/DoT rules when enableDohBlock is not set', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync({
      targets: [],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: false,
    });

    expect(calls.some((args) => args.includes('853'))).toBe(false);
  });

  it('dry-run mode never issues mutating nft commands (snapshot read is still allowed)', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig({ dryRun: true }), fakeLogger());

    await controller.sync({
      targets: [{ deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50' }],
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
    });

    // The only real exec call is the pre-sync read-only snapshot; every
    // mutating call (add/flush table/chain/rule) is short-circuited by run().
    expect(calls).toEqual([['list', 'ruleset']]);
  });
});

describe('NftablesController — skips an idempotent rebuild', () => {
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
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await controller.sync(syncArgs());
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await controller.sync(syncArgs());
    expect(calls.length).toBe(callsAfterFirst);
  });

  it('logs a debug message instead of shelling out when skipped', async () => {
    mockExecFile();
    const logger = fakeLogger();
    const controller = new NftablesController(baseConfig(), logger);

    await controller.sync(syncArgs());
    await controller.sync(syncArgs());

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('sync skipped'));
  });

  it('rebuilds again once the policy actually changes', async () => {
    const calls = mockExecFile();
    const controller = new NftablesController(baseConfig(), fakeLogger());

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
    const calls = mockExecFile({ fail: (args) => shouldFail && args[0] === 'add' && args[1] === 'rule' });
    const controller = new NftablesController(baseConfig(), fakeLogger());

    await expect(controller.sync(syncArgs())).rejects.toThrow();
    const callsAfterFailedAttempt = calls.length;

    shouldFail = false;
    await controller.sync(syncArgs());
    expect(calls.length).toBeGreaterThan(callsAfterFailedAttempt);
  });

  it('does not cache a signature when the v6 DNS-redirect sub-step fails, so it retries every cycle until it succeeds', async () => {
    let v6ShouldFail = true;
    const calls = mockExecFile({
      fail: (args) => v6ShouldFail && args[0] === 'add' && args[2] === 'ip6' && args[3] === 'guardtime_nat6',
    });
    const controller = new NftablesController(baseConfig({ enableIpv6: true }), fakeLogger());

    const args = { ...syncArgs(), dnsRedirectIpv6: '2001:db8::53' };

    await controller.sync(args);
    const callsAfterFirst = calls.length;

    await controller.sync(args);
    // Still retries in full — the v6 sub-step kept failing, so no signature was cached.
    expect(calls.length).toBeGreaterThan(callsAfterFirst);

    v6ShouldFail = false;
    const callsAfterSecond = calls.length;
    await controller.sync(args);
    const callsAfterThird = calls.length;
    expect(callsAfterThird).toBeGreaterThan(callsAfterSecond);

    // Now that v6 succeeded, a fourth identical sync is fully skipped.
    const callsAfterFourthAttemptStart = calls.length;
    await controller.sync(args);
    expect(calls.length).toBe(callsAfterFourthAttemptStart);
  });
});

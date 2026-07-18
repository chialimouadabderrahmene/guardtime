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

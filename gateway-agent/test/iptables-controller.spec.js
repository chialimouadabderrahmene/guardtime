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

'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { DrayTekPlugin, ruleIndexFor, DRAYTEK_CLI } = require('../src/router-integrations/draytek');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.1.1',
    credentials: { username: 'admin', password: 'secret', snmpCommunity: 'public' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

/** `handler(cmd, args)` returns `{ stdout, stderr, error }`; dispatches both snmpget and ssh calls. */
function mockExecFile(handler) {
  const calls = [];
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    calls.push({ cmd, args });
    const result = handler(cmd, args) || {};
    if (result.error) {
      cb(result.error);
      return;
    }
    cb(null, { stdout: result.stdout || '', stderr: result.stderr || '' });
  });
  return calls;
}

describe('snmpGet (via detect/health)', () => {
  beforeEach(() => execFile.mockReset());

  it('detect() identifies a DrayTek device from sysDescr', async () => {
    mockExecFile(() => ({ stdout: 'iso.3.6.1.2.1.1.1.0 = STRING: "DrayTek Vigor2865"\n' }));
    const result = await DrayTekPlugin.detect(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toBe('DrayTek Vigor2865');
  });

  it('detect() reports failure when sysDescr does not match DrayTek/Vigor', async () => {
    mockExecFile(() => ({ stdout: 'iso.3.6.1.2.1.1.1.0 = STRING: "Some Other Router"\n' }));
    const result = await DrayTekPlugin.detect(baseCtx());
    expect(result.success).toBe(false);
  });

  it('uses the configured SNMP community string', async () => {
    const calls = mockExecFile(() => ({ stdout: 'STRING: "DrayTek"\n' }));
    await DrayTekPlugin.detect(baseCtx({ credentials: { snmpCommunity: 'my-community' } }));
    expect(calls[0].cmd).toBe('snmpget');
    expect(calls[0].args).toContain('my-community');
  });

  it('health() reports reachable with latency and sysDescr', async () => {
    mockExecFile(() => ({ stdout: 'iso.3.6.1.2.1.1.1.0 = STRING: "DrayTek Vigor2865"\n' }));
    const result = await DrayTekPlugin.health(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/DrayTek Vigor2865 \(\d+ms\)/);
  });

  it('health() reports failure when snmpget errors', async () => {
    mockExecFile(() => ({ error: new Error('Timeout: No Response') }));
    const result = await DrayTekPlugin.health(baseCtx());
    expect(result.success).toBe(false);
  });
});

describe('SSH CLI invocation shape', () => {
  beforeEach(() => execFile.mockReset());

  it('uses sshpass to wrap ssh when only a password is configured', async () => {
    const calls = mockExecFile(() => ({ stdout: 'ok\n' }));
    await DrayTekPlugin.login(baseCtx());
    expect(calls[0].cmd).toBe('sshpass');
    expect(calls[0].args).toContain('ssh');
    expect(calls[0].args).toContain('admin@192.168.1.1');
  });

  it('uses ssh directly when a private key is configured', async () => {
    const calls = mockExecFile(() => ({ stdout: 'ok\n' }));
    await DrayTekPlugin.login(baseCtx({ credentials: { username: 'admin', privateKeyPath: '/keys/id_rsa' } }));
    expect(calls[0].cmd).toBe('ssh');
    expect(calls[0].args).toContain('-i');
  });

  it('login() reports failure when the CLI reports an error', async () => {
    mockExecFile(() => ({ stdout: '% Error: invalid parameter\n' }));
    const result = await DrayTekPlugin.login(baseCtx());
    expect(result.success).toBe(false);
  });
});

describe('DrayTekPlugin — changeDNS', () => {
  beforeEach(() => execFile.mockReset());

  it('sets and verifies the new DNS1 value', async () => {
    let dns1 = '8.8.8.8';
    mockExecFile((cmd, args) => {
      const command = args[args.length - 1];
      if (command === DRAYTEK_CLI.setDns('1.1.1.1')) {
        dns1 = '1.1.1.1';
        return { stdout: 'OK\n' };
      }
      if (command === DRAYTEK_CLI.showDns) return { stdout: `DNS1: ${dns1}\n` };
      return { stdout: '' };
    });
    const result = await DrayTekPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'DNS server set to 1.1.1.1' });
  });

  it('reports failure when the DNS change does not verify', async () => {
    mockExecFile((cmd, args) => {
      const command = args[args.length - 1];
      if (command === DRAYTEK_CLI.showDns) return { stdout: 'DNS1: 8.8.8.8\n' };
      return { stdout: '' };
    });
    const result = await DrayTekPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
  });
});

describe('DrayTekPlugin — firewall filter rules', () => {
  beforeEach(() => execFile.mockReset());

  it('applyFirewallRule adds a filter rule keyed by IP and verifies it is enabled', async () => {
    const idx = ruleIndexFor('192.168.1.50');
    let ruleEnabled = false;
    mockExecFile((cmd, args) => {
      const command = args[args.length - 1];
      if (command.startsWith('filter set 3 rule') && command.includes('enable')) {
        ruleEnabled = true;
        return { stdout: 'OK\n' };
      }
      if (command === DRAYTEK_CLI.showFilterRule(idx)) return { stdout: ruleEnabled ? 'Enable: Yes\n' : 'Enable: No\n' };
      return { stdout: '' };
    });
    const result = await DrayTekPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50' });
    expect(result.success).toBe(true);
  });

  it('applyFirewallRule requires an ipAddress', async () => {
    const result = await DrayTekPlugin.applyFirewallRule(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('removeFirewallRule is a no-op success when no active rule exists', async () => {
    mockExecFile(() => ({ stdout: 'Enable: No\n' }));
    const result = await DrayTekPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.1.50' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already clear/);
  });

  it('blockMAC/unblockMAC manage a filter rule keyed by MAC', async () => {
    const idx = ruleIndexFor('AA:BB:CC:DD:EE:FF');
    let ruleEnabled = false;
    mockExecFile((cmd, args) => {
      const command = args[args.length - 1];
      if (command.includes('src-mac') && command.includes('enable')) {
        ruleEnabled = true;
        return { stdout: 'OK\n' };
      }
      if (command === `filter set 3 rule ${idx} disable`) {
        ruleEnabled = false;
        return { stdout: 'OK\n' };
      }
      if (command === DRAYTEK_CLI.showFilterRule(idx)) return { stdout: ruleEnabled ? 'Enable: Yes\n' : 'Enable: No\n' };
      return { stdout: '' };
    });

    const blocked = await DrayTekPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(blocked.success).toBe(true);

    const unblocked = await DrayTekPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(unblocked.success).toBe(true);
  });
});

describe('DrayTekPlugin — disconnectClient', () => {
  it('honestly reports no documented instant-disconnect action', async () => {
    const result = await DrayTekPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no documented instant wireless-disconnect/);
  });
});

describe('DrayTekPlugin — dry-run', () => {
  beforeEach(() => execFile.mockReset());

  it('never calls execFile for mutating actions in dry-run mode', async () => {
    const result = await DrayTekPlugin.applyFirewallRule(baseCtx({ dryRun: true }), { ipAddress: '192.168.1.50' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(execFile).not.toHaveBeenCalled();
  });
});

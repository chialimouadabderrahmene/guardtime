'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { EdgeRouterPlugin } = require('../src/router-integrations/edgerouter');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.1.1',
    credentials: { username: 'ubnt', password: 'secret' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

/** `handler(bin, args)` returns `{ stdout, stderr }`. */
function mockExecFile(handler) {
  const calls = [];
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    calls.push({ cmd, args });
    const result = handler(cmd, args);
    if (result.error) {
      cb(result.error);
      return;
    }
    cb(null, { stdout: result.stdout || '', stderr: result.stderr || '' });
  });
  return calls;
}

describe('EdgeRouterPlugin — SSH invocation shape', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('uses sshpass to wrap ssh when only a password is configured (no private key)', async () => {
    const calls = mockExecFile(() => ({ stdout: 'ubnt-edgerouter\n' }));
    await EdgeRouterPlugin.detect(baseCtx());

    expect(calls[0].cmd).toBe('sshpass');
    expect(calls[0].args[0]).toBe('-p');
    expect(calls[0].args[1]).toBe('secret');
    expect(calls[0].args[2]).toBe('ssh');
    expect(calls[0].args).toContain('ubnt@192.168.1.1');
  });

  it('uses ssh directly (no sshpass) when a private key is configured', async () => {
    const calls = mockExecFile(() => ({ stdout: 'ubnt-edgerouter\n' }));
    await EdgeRouterPlugin.detect(baseCtx({ credentials: { username: 'ubnt', privateKeyPath: '/keys/id_rsa' } }));

    expect(calls[0].cmd).toBe('ssh');
    expect(calls[0].args).toContain('-i');
    expect(calls[0].args).toContain('/keys/id_rsa');
  });

  it('passes a semicolon-joined configure/commit/save/exit script for mutating commands', async () => {
    const calls = mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: 'action drop\n' }; // verify (show) call
    });

    await EdgeRouterPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50', deviceId: 'dev-1' });

    const configureCall = calls.find((c) => c.args[c.args.length - 1].startsWith('configure'));
    const script = configureCall.args[configureCall.args.length - 1];
    expect(script).toMatch(/^configure; set firewall name WAN_LOCAL rule \d+ action drop;.*; commit; save; exit$/);
    expect(script).toContain('source address 192.168.1.50');
  });
});

describe('EdgeRouterPlugin.detect / testConnection / login', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('detect succeeds when the SSH show command returns output', async () => {
    mockExecFile(() => ({ stdout: 'my-edgerouter\n' }));
    const result = await EdgeRouterPlugin.detect(baseCtx());
    expect(result).toEqual({ success: true, message: 'EdgeRouter (EdgeOS) SSH CLI reachable', detail: 'my-edgerouter' });
  });

  it('detect fails cleanly when SSH itself fails', async () => {
    mockExecFile(() => ({ error: new Error('Connection refused') }));
    const result = await EdgeRouterPlugin.detect(baseCtx());
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Connection refused/);
  });

  it('testConnection and login both succeed on a reachable host', async () => {
    mockExecFile(() => ({ stdout: 'host\n' }));
    expect((await EdgeRouterPlugin.testConnection(baseCtx())).success).toBe(true);
    expect((await EdgeRouterPlugin.login(baseCtx())).success).toBe(true);
  });
});

describe('EdgeRouterPlugin firewall rule (IP-based) operations', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('applyFirewallRule verifies the rule via a show command after setting it', async () => {
    mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: 'action drop\nsource {\n  address 192.168.1.50\n}\n' };
    });

    const result = await EdgeRouterPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50', deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'firewall drop rule added for 192.168.1.50' });
  });

  it('applyFirewallRule reports failure when verification does not show the drop action', async () => {
    mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: '' }; // nothing there — verification fails
    });

    const result = await EdgeRouterPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/did not verify/);
  });

  it('applyFirewallRule requires an ipAddress', async () => {
    const result = await EdgeRouterPlugin.applyFirewallRule(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('removeFirewallRule is a no-op success when no matching rule exists', async () => {
    mockExecFile(() => ({ stdout: '' }));
    const result = await EdgeRouterPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.1.99' });
    expect(result).toEqual({ success: true, message: 'no firewall drop rule found for 192.168.1.99 (already clear)' });
  });

  it('removeFirewallRule deletes an existing rule', async () => {
    const calls = mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: 'action drop\n' };
    });

    const result = await EdgeRouterPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.1.50', deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'firewall drop rule removed for 192.168.1.50' });
    const deleteCall = calls.find((c) => c.args[c.args.length - 1].includes('delete firewall'));
    expect(deleteCall).toBeDefined();
  });

  it('an EdgeOS CLI error in the output surfaces as a failure result, not a thrown exception', async () => {
    mockExecFile(() => ({ stdout: 'Error: Illegal source address\n' }));
    const result = await EdgeRouterPlugin.applyFirewallRule(baseCtx(), { ipAddress: 'not-an-ip', deviceId: 'dev-1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Illegal source address/);
  });
});

describe('EdgeRouterPlugin MAC-based operations', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('blockMAC sets a drop rule matched on source mac-address', async () => {
    const calls = mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: 'action drop\n' };
    });

    const result = await EdgeRouterPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF', deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF blocked' });
    const configureCall = calls.find((c) => c.args[c.args.length - 1].startsWith('configure'));
    expect(configureCall.args[configureCall.args.length - 1]).toContain('source mac-address AA:BB:CC:DD:EE:FF');
  });

  it('blockMAC requires a macAddress', async () => {
    const result = await EdgeRouterPlugin.blockMAC(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('unblockMAC is a no-op success when already unblocked', async () => {
    mockExecFile(() => ({ stdout: '' }));
    const result = await EdgeRouterPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF already unblocked (no matching rule)' });
  });
});

describe('EdgeRouterPlugin.changeDNS', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('sets and verifies the system name-server', async () => {
    mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: '1.1.1.1\n' };
    });

    const result = await EdgeRouterPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'DNS server set to 1.1.1.1' });
  });
});

describe('EdgeRouterPlugin.disconnectClient — honest unsupported-capability response', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('reports failure with an explanatory message instead of pretending to disconnect', async () => {
    const result = await EdgeRouterPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no built-in wireless client table/);
    expect(execFile).not.toHaveBeenCalled();
  });
});

describe('EdgeRouterPlugin dry-run', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('never calls execFile for a mutating action in dry-run mode', async () => {
    const result = await EdgeRouterPlugin.blockMAC(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('pauseDevice/resumeDevice alias to applyFirewallRule/removeFirewallRule', async () => {
    mockExecFile((cmd, args) => {
      const script = args[args.length - 1];
      if (script.startsWith('configure')) return { stdout: '' };
      return { stdout: 'action drop\n' };
    });

    const paused = await EdgeRouterPlugin.pauseDevice(baseCtx(), { ipAddress: '192.168.1.50', deviceId: 'dev-1' });
    expect(paused.message).toMatch(/added/);
  });
});

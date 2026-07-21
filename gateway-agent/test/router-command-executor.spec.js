'use strict';

jest.mock('../src/router-integrations/loader');
jest.mock('../src/router-discovery');

const { loadPlugin } = require('../src/router-integrations/loader');
const { discoverRouter } = require('../src/router-discovery');
const { RouterCommandExecutor } = require('../src/router-command-executor');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function fakeBackend(overrides = {}) {
  return {
    getRouterCommands: jest.fn().mockResolvedValue({ commands: [], routerConnection: null }),
    ackRouterCommand: jest.fn().mockResolvedValue({}),
    reportRouterDetection: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function baseConfig(overrides = {}) {
  return {
    backendUrl: 'https://api.example.test',
    dryRun: false,
    enableRouterDetection: true,
    routerDetectionIntervalMs: 300000,
    ...overrides,
  };
}

function buildExecutor(overrides = {}) {
  const backend = overrides.backend ?? fakeBackend();
  const config = overrides.config ?? baseConfig();
  const logger = overrides.logger ?? fakeLogger();
  return { executor: new RouterCommandExecutor({ backend, config, logger }), backend, config, logger };
}

describe('RouterCommandExecutor.maybeRunDetection', () => {
  beforeEach(() => {
    discoverRouter.mockReset();
  });

  it('does nothing when router detection is disabled', async () => {
    const { executor, backend } = buildExecutor({ config: baseConfig({ enableRouterDetection: false }) });
    await executor.maybeRunDetection();
    expect(discoverRouter).not.toHaveBeenCalled();
    expect(backend.reportRouterDetection).not.toHaveBeenCalled();
  });

  it('runs discovery and reports it on the first call', async () => {
    discoverRouter.mockResolvedValue({ vendor: 'MikroTik' });
    const { executor, backend } = buildExecutor();

    await executor.maybeRunDetection();

    expect(discoverRouter).toHaveBeenCalledTimes(1);
    expect(backend.reportRouterDetection).toHaveBeenCalledWith({ vendor: 'MikroTik' });
  });

  it('does not re-scan again before the configured interval elapses', async () => {
    discoverRouter.mockResolvedValue({ vendor: 'MikroTik' });
    const { executor } = buildExecutor({ config: baseConfig({ routerDetectionIntervalMs: 999999999 }) });

    await executor.maybeRunDetection();
    await executor.maybeRunDetection();

    expect(discoverRouter).toHaveBeenCalledTimes(1);
  });
});

describe('RouterCommandExecutor.executeCommand', () => {
  beforeEach(() => {
    loadPlugin.mockReset();
    discoverRouter.mockReset();
  });

  it('DETECT re-runs discovery and reports it, regardless of routerConnection', async () => {
    discoverRouter.mockResolvedValue({ vendor: 'OpenWrt' });
    const { executor, backend } = buildExecutor();

    const result = await executor.executeCommand({ id: 'cmd-1', type: 'DETECT' }, null);

    expect(result).toEqual({ success: true, detection: { vendor: 'OpenWrt' } });
    expect(backend.reportRouterDetection).toHaveBeenCalledWith({ vendor: 'OpenWrt' });
  });

  it('reports failure when no router/plugin is configured for a non-DETECT command', async () => {
    const { executor } = buildExecutor();
    const result = await executor.executeCommand({ id: 'cmd-1', type: 'TEST_CONNECTION', payload: null }, null);
    expect(result.success).toBe(false);
    expect(loadPlugin).not.toHaveBeenCalled();
  });

  it('dispatches a simple command type to the matching plugin method', async () => {
    const plugin = { changeDNS: jest.fn().mockResolvedValue({ success: true, message: 'done' }) };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const routerConnection = { pluginId: 'mikrotik', ipAddress: '192.168.88.1', credentials: { username: 'admin' } };
    const command = { id: 'cmd-1', type: 'CHANGE_DNS', deviceId: null, payload: JSON.stringify({ dnsServer: '1.1.1.1' }) };

    const result = await executor.executeCommand(command, routerConnection);

    expect(loadPlugin).toHaveBeenCalledWith('mikrotik', expect.anything());
    expect(plugin.changeDNS).toHaveBeenCalledWith(
      { ipAddress: '192.168.88.1', credentials: { username: 'admin' }, logger: expect.anything(), dryRun: false },
      { deviceId: null, macAddress: undefined, ipAddress: undefined, dnsServer: '1.1.1.1' },
    );
    expect(result).toEqual({ success: true, message: 'done' });
  });

  it('reports failure for an unsupported command type', async () => {
    loadPlugin.mockReturnValue({});
    const { executor } = buildExecutor();
    const result = await executor.executeCommand(
      { id: 'cmd-1', type: 'NOT_A_REAL_TYPE', payload: null },
      { pluginId: 'mikrotik' },
    );
    expect(result.success).toBe(false);
  });

  it('tolerates malformed JSON payload without throwing', async () => {
    const plugin = { testConnection: jest.fn().mockResolvedValue({ success: true, message: 'ok' }) };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const result = await executor.executeCommand(
      { id: 'cmd-1', type: 'TEST_CONNECTION', payload: '{not json' },
      { pluginId: 'mikrotik' },
    );
    expect(result.success).toBe(true);
  });
});

describe('RouterCommandExecutor.runEndGamingSession (via executeCommand)', () => {
  beforeEach(() => {
    loadPlugin.mockReset();
  });

  function mockConnectivity(executor, sequence) {
    let i = 0;
    executor.checkConnectivity = jest.fn(async () => sequence[Math.min(i++, sequence.length - 1)]);
  }

  it('stops at the first strategy that succeeds and passes the connectivity check', async () => {
    const plugin = {
      disconnectClient: jest.fn().mockResolvedValue({ success: false, message: 'not associated' }),
      pauseDevice: jest.fn().mockResolvedValue({ success: true, message: 'blocked' }),
      resumeDevice: jest.fn(),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();
    mockConnectivity(executor, [true]);

    const command = {
      id: 'cmd-1',
      type: 'END_GAMING_SESSION',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['DISCONNECT_CLIENT', 'PAUSE_DEVICE', 'CHANGE_DNS'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik', ipAddress: '192.168.88.1' });

    expect(result.success).toBe(true);
    expect(result.strategyUsed).toBe('PAUSE_DEVICE');
    expect(plugin.disconnectClient).toHaveBeenCalledTimes(1);
    expect(plugin.pauseDevice).toHaveBeenCalledTimes(1);
    expect(plugin.resumeDevice).not.toHaveBeenCalled(); // no rollback needed, it worked
  });

  it('rolls back via the inverse method when connectivity is lost, then tries the next strategy', async () => {
    const plugin = {
      pauseDevice: jest.fn().mockResolvedValue({ success: true, message: 'blocked' }),
      resumeDevice: jest.fn().mockResolvedValue({ success: true, message: 'restored' }),
      blockMAC: jest.fn().mockResolvedValue({ success: true, message: 'mac blocked' }),
      unblockMAC: jest.fn(),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();
    mockConnectivity(executor, [false, true]); // first strategy loses connectivity, second is fine

    const command = {
      id: 'cmd-1',
      type: 'END_GAMING_SESSION',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['PAUSE_DEVICE', 'BLOCK_MAC'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik' });

    expect(plugin.pauseDevice).toHaveBeenCalledTimes(1);
    expect(plugin.resumeDevice).toHaveBeenCalledTimes(1); // rollback fired
    expect(plugin.blockMAC).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.strategyUsed).toBe('BLOCK_MAC');
    expect(result.attempts[0]).toMatchObject({ strategy: 'PAUSE_DEVICE', success: true, rolledBack: true });
  });

  it('reports overall failure when every strategy fails', async () => {
    const plugin = {
      disconnectClient: jest.fn().mockResolvedValue({ success: false, message: 'nope' }),
      pauseDevice: jest.fn().mockResolvedValue({ success: false, message: 'nope' }),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const command = {
      id: 'cmd-1',
      type: 'END_GAMING_SESSION',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['DISCONNECT_CLIENT', 'PAUSE_DEVICE'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik' });
    expect(result.success).toBe(false);
    expect(result.strategyUsed).toBeNull();
    expect(result.attempts).toHaveLength(2);
  });
});

describe('RouterCommandExecutor.runMultiStrategyAction (BLOCK_DEVICE/UNBLOCK_DEVICE via executeCommand)', () => {
  beforeEach(() => {
    loadPlugin.mockReset();
  });

  it('BLOCK_DEVICE stops at the first strategy that succeeds, with no connectivity check/rollback', async () => {
    const plugin = {
      pauseDevice: jest.fn().mockResolvedValue({ success: true, message: 'blocked' }),
      resumeDevice: jest.fn(),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();
    executor.checkConnectivity = jest.fn();

    const command = {
      id: 'cmd-1',
      type: 'BLOCK_DEVICE',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['PAUSE_DEVICE', 'BLOCK_MAC'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik', ipAddress: '192.168.88.1' });

    expect(result).toEqual({
      success: true,
      strategyUsed: 'PAUSE_DEVICE',
      attempts: [{ strategy: 'PAUSE_DEVICE', success: true, message: 'blocked' }],
    });
    expect(plugin.resumeDevice).not.toHaveBeenCalled();
    expect(executor.checkConnectivity).not.toHaveBeenCalled();
  });

  it('BLOCK_DEVICE falls through to the next strategy when the first fails', async () => {
    const plugin = {
      pauseDevice: jest.fn().mockResolvedValue({ success: false, message: 'not supported' }),
      blockMAC: jest.fn().mockResolvedValue({ success: true, message: 'mac blocked' }),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const command = {
      id: 'cmd-1',
      type: 'BLOCK_DEVICE',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['PAUSE_DEVICE', 'BLOCK_MAC'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik' });

    expect(result.success).toBe(true);
    expect(result.strategyUsed).toBe('BLOCK_MAC');
    expect(result.attempts).toHaveLength(2);
  });

  it('BLOCK_DEVICE reports overall failure when every strategy fails', async () => {
    const plugin = {
      pauseDevice: jest.fn().mockResolvedValue({ success: false, message: 'nope' }),
      blockMAC: jest.fn().mockResolvedValue({ success: false, message: 'nope' }),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const command = {
      id: 'cmd-1',
      type: 'BLOCK_DEVICE',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['PAUSE_DEVICE', 'BLOCK_MAC'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik' });
    expect(result.success).toBe(false);
    expect(result.strategyUsed).toBeNull();
  });

  it('UNBLOCK_DEVICE calls the inverse method for each strategy (resumeDevice/removeFirewallRule/unblockMAC), not the block method', async () => {
    const plugin = {
      resumeDevice: jest.fn().mockResolvedValue({ success: true, message: 'resumed' }),
      pauseDevice: jest.fn(),
    };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const command = {
      id: 'cmd-1',
      type: 'UNBLOCK_DEVICE',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['PAUSE_DEVICE', 'BLOCK_MAC'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik' });

    expect(result.success).toBe(true);
    expect(result.strategyUsed).toBe('PAUSE_DEVICE');
    expect(plugin.resumeDevice).toHaveBeenCalledTimes(1);
    expect(plugin.pauseDevice).not.toHaveBeenCalled();
  });

  it('skips a strategy with no mapped method instead of throwing', async () => {
    const plugin = { blockMAC: jest.fn().mockResolvedValue({ success: true, message: 'mac blocked' }) };
    loadPlugin.mockReturnValue(plugin);
    const { executor } = buildExecutor();

    const command = {
      id: 'cmd-1',
      type: 'BLOCK_DEVICE',
      deviceId: 'dev-1',
      payload: JSON.stringify({ deviceId: 'dev-1', strategies: ['NOT_A_REAL_STRATEGY', 'BLOCK_MAC'] }),
    };

    const result = await executor.executeCommand(command, { pluginId: 'mikrotik' });
    expect(result.success).toBe(true);
    expect(result.strategyUsed).toBe('BLOCK_MAC');
  });
});

describe('RouterCommandExecutor.sync', () => {
  beforeEach(() => {
    loadPlugin.mockReset();
  });

  it('executes and acks every pending command', async () => {
    const plugin = { testConnection: jest.fn().mockResolvedValue({ success: true, message: 'ok' }) };
    loadPlugin.mockReturnValue(plugin);
    const backend = fakeBackend({
      getRouterCommands: jest.fn().mockResolvedValue({
        commands: [{ id: 'cmd-1', type: 'TEST_CONNECTION', payload: null }],
        routerConnection: { pluginId: 'mikrotik', ipAddress: '192.168.88.1' },
      }),
    });
    const { executor } = buildExecutor({ backend });

    await executor.sync();

    expect(backend.ackRouterCommand).toHaveBeenCalledWith('cmd-1', true, { success: true, message: 'ok' });
  });

  it('acks failure and logs when executing a command throws unexpectedly', async () => {
    loadPlugin.mockImplementation(() => {
      throw new Error('boom');
    });
    const backend = fakeBackend({
      getRouterCommands: jest.fn().mockResolvedValue({
        commands: [{ id: 'cmd-1', type: 'TEST_CONNECTION', payload: null }],
        routerConnection: { pluginId: 'mikrotik' },
      }),
    });
    const logger = fakeLogger();
    const { executor } = buildExecutor({ backend, logger });

    await executor.sync();

    expect(logger.error).toHaveBeenCalled();
    expect(backend.ackRouterCommand).toHaveBeenCalledWith('cmd-1', false, { error: 'boom' });
  });

  it('does nothing when there are no pending commands', async () => {
    const backend = fakeBackend();
    const { executor } = buildExecutor({ backend });
    await executor.sync();
    expect(backend.ackRouterCommand).not.toHaveBeenCalled();
  });
});

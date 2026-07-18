'use strict';

const { ConnectionKiller } = require('../src/connection-killer');
const { Metrics } = require('../src/metrics');
const { ManagementGuard } = require('../src/management-guard');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function target(overrides = {}) {
  return { deviceId: 'dev-1', action: 'BLOCK', ipAddress: '192.168.1.50', macAddress: 'AA:BB:CC:DD:EE:FF', ...overrides };
}

function buildKiller({ conntrack, tcpReset, managementGuard, metrics, logger } = {}) {
  const finalLogger = logger || fakeLogger();
  return {
    logger: finalLogger,
    metrics: metrics || new Metrics(),
    conntrack: conntrack || { killDevice: jest.fn().mockResolvedValue(undefined), listTcpConnections: jest.fn().mockResolvedValue([]) },
    tcpReset: tcpReset || { killDevice: jest.fn().mockResolvedValue(undefined) },
    managementGuard: managementGuard || new ManagementGuard({ managementIps: [], ipBin: 'ip' }, finalLogger),
  };
}

describe('ConnectionKiller', () => {
  describe('_shouldRun transition detection', () => {
    it('runs on the first observation of a BLOCK target', () => {
      const deps = buildKiller();
      const killer = new ConnectionKiller(deps);
      expect(killer._shouldRun(target())).toBe(true);
    });

    it('does not re-run on a second cycle with the same BLOCK state', () => {
      const deps = buildKiller();
      const killer = new ConnectionKiller(deps);
      killer._rememberStates([target()]);
      expect(killer._shouldRun(target())).toBe(false);
    });

    it('runs again if the device leaves BLOCK and re-enters it', () => {
      const deps = buildKiller();
      const killer = new ConnectionKiller(deps);
      killer._rememberStates([target({ action: 'BLOCK' })]);
      killer._rememberStates([target({ action: 'ALLOW' })]);
      expect(killer._shouldRun(target({ action: 'BLOCK' }))).toBe(true);
    });

    it('runs again if the IP changes while still BLOCK', () => {
      const deps = buildKiller();
      const killer = new ConnectionKiller(deps);
      killer._rememberStates([target({ ipAddress: '192.168.1.50' })]);
      expect(killer._shouldRun(target({ ipAddress: '192.168.1.99' }))).toBe(true);
    });

    it('never runs without a resolved IP address', () => {
      const deps = buildKiller();
      const killer = new ConnectionKiller(deps);
      expect(killer._shouldRun(target({ ipAddress: null }))).toBe(false);
    });
  });

  it('kills conntrack + injects tcp resets on a fresh BLOCK transition', async () => {
    const deps = buildKiller();
    const killer = new ConnectionKiller(deps);

    await killer.sync([target()]);

    expect(deps.conntrack.killDevice).toHaveBeenCalledWith('192.168.1.50');
    expect(deps.tcpReset.killDevice).toHaveBeenCalledWith('192.168.1.50', []);
    expect(deps.metrics.snapshot()['connectionKiller.killed']).toBe(1);
  });

  it('retries conntrack kill on transient failure and succeeds', async () => {
    const conntrack = {
      killDevice: jest.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce(undefined),
      listTcpConnections: jest.fn().mockResolvedValue([]),
    };
    const deps = buildKiller({ conntrack });
    const killer = new ConnectionKiller(deps);

    await killer.sync([target()]);

    expect(conntrack.killDevice).toHaveBeenCalledTimes(2);
    expect(deps.metrics.snapshot()['connectionKiller.retries']).toBe(1);
    expect(deps.metrics.snapshot()['connectionKiller.killed']).toBe(1);
    expect(deps.tcpReset.killDevice).toHaveBeenCalledTimes(1);
  });

  it('records a failure metric and skips tcp reset when retries are exhausted', async () => {
    const conntrack = {
      killDevice: jest.fn().mockRejectedValue(new Error('permanently stuck')),
      listTcpConnections: jest.fn().mockResolvedValue([]),
    };
    const logger = fakeLogger();
    const deps = buildKiller({ conntrack, logger });
    const killer = new ConnectionKiller(deps);

    await killer.sync([target()]);

    expect(conntrack.killDevice).toHaveBeenCalledTimes(3);
    expect(deps.tcpReset.killDevice).not.toHaveBeenCalled();
    expect(deps.metrics.snapshot()['connectionKiller.failed']).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      'connection kill failed after retries exhausted',
      expect.objectContaining({ deviceId: 'dev-1' }),
    );
  });

  it('never targets a management-guard protected IP', async () => {
    const managementGuard = new ManagementGuard({ managementIps: ['192.168.1.1'], ipBin: 'ip' }, fakeLogger());
    const deps = buildKiller({ managementGuard });
    const killer = new ConnectionKiller(deps);

    await killer.sync([target({ deviceId: 'gw-mgmt', ipAddress: '192.168.1.1' })]);

    expect(deps.conntrack.killDevice).not.toHaveBeenCalled();
    expect(deps.metrics.snapshot()['connectionKiller.protectedSkipped']).toBe(1);
  });

  it('dispatches multiple BLOCK transitions concurrently and remembers all target states', async () => {
    const deps = buildKiller();
    const killer = new ConnectionKiller(deps);
    const targets = [
      target({ deviceId: 'dev-1', ipAddress: '192.168.1.50' }),
      target({ deviceId: 'dev-2', ipAddress: '192.168.1.51' }),
      target({ deviceId: 'dev-3', action: 'ALLOW', ipAddress: '192.168.1.52' }),
    ];

    await killer.sync(targets);

    expect(deps.conntrack.killDevice).toHaveBeenCalledWith('192.168.1.50');
    expect(deps.conntrack.killDevice).toHaveBeenCalledWith('192.168.1.51');
    expect(deps.conntrack.killDevice).toHaveBeenCalledTimes(2);

    // Second sync with identical states should trigger no further kills.
    await killer.sync(targets);
    expect(deps.conntrack.killDevice).toHaveBeenCalledTimes(2);
  });
});

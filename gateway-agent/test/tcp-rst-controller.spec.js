'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { TcpRstController } = require('../src/tcp-rst-controller');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseConfig(overrides = {}) {
  return { pythonBin: 'python3', enableTcpRst: true, tcpRstSniffMs: 700, dryRun: false, ...overrides };
}

function mockPython({ stdout = '{"ok": true, "rstPacketsSent": 2}', fail } = {}) {
  const calls = [];
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    calls.push({ cmd, args });
    if (fail) {
      cb(new Error('simulated scapy failure'));
      return;
    }
    cb(null, { stdout, stderr: '' });
  });
  return calls;
}

describe('TcpRstController', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('invokes python3 with the device IPv4 address and known flows as JSON payload', async () => {
    const calls = mockPython();
    const controller = new TcpRstController(baseConfig(), fakeLogger(), { listTcpConnections: jest.fn() });

    await controller.killDevice('192.168.1.50', [{ src: '192.168.1.50', sport: 5000, dst: '1.2.3.4', dport: 443 }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('python3');
    const payload = JSON.parse(calls[0].args[2]);
    expect(payload.deviceIp).toBe('192.168.1.50');
    expect(payload.flows).toHaveLength(1);
  });

  it('invokes python3 with an IPv6 device address the same way as IPv4', async () => {
    const calls = mockPython();
    const controller = new TcpRstController(baseConfig(), fakeLogger(), { listTcpConnections: jest.fn() });

    await controller.killDevice('2001:db8::1', [{ src: '2001:db8::1', sport: 5000, dst: '2606:4700::1', dport: 443 }]);

    const payload = JSON.parse(calls[0].args[2]);
    expect(payload.deviceIp).toBe('2001:db8::1');
  });

  it('does nothing when enableTcpRst is false', async () => {
    const calls = mockPython();
    const controller = new TcpRstController(baseConfig({ enableTcpRst: false }), fakeLogger(), {});

    await controller.killDevice('192.168.1.50', []);

    expect(calls).toHaveLength(0);
  });

  it('does nothing when no IP address is given', async () => {
    const calls = mockPython();
    const controller = new TcpRstController(baseConfig(), fakeLogger(), {});

    await controller.killDevice(null, []);

    expect(calls).toHaveLength(0);
  });

  it('dry-run mode logs instead of spawning python3', async () => {
    const calls = mockPython();
    const logger = fakeLogger();
    const controller = new TcpRstController(baseConfig({ dryRun: true }), logger, {});

    await controller.killDevice('192.168.1.50', []);

    expect(calls).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith('[dry-run] python tcp rst injection', expect.objectContaining({ ipAddress: '192.168.1.50' }));
  });

  it('logs a warning (does not throw) when the scapy subprocess fails', async () => {
    mockPython({ fail: true });
    const logger = fakeLogger();
    const controller = new TcpRstController(baseConfig(), logger, {});

    await expect(controller.killDevice('192.168.1.50', [])).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('tcp rst injection failed', expect.objectContaining({ ipAddress: '192.168.1.50' }));
  });

  it('falls back to listing conntrack flows itself when knownFlows is not supplied', async () => {
    mockPython();
    const conntrack = { listTcpConnections: jest.fn().mockResolvedValue([{ src: '192.168.1.50', sport: 1, dst: '1.1.1.1', dport: 443 }]) };
    const controller = new TcpRstController(baseConfig(), fakeLogger(), conntrack);

    await controller.killDevice('192.168.1.50');

    expect(conntrack.listTcpConnections).toHaveBeenCalledWith('192.168.1.50');
  });
});

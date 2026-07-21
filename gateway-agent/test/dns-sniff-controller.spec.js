'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { DnsSniffController } = require('../src/dns-sniff-controller');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function mockExecFileStdout(stdout) {
  execFile.mockImplementation((...args) => {
    const cb = args[args.length - 1];
    cb(null, { stdout, stderr: '' });
  });
}

describe('DnsSniffController.captureDnsQueries', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('returns an empty array when disabled by config (default)', async () => {
    const controller = new DnsSniffController({ enableVpnDnsSniff: false }, fakeLogger());
    expect(await controller.captureDnsQueries('192.168.1.50')).toEqual([]);
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns an empty array without an IP address', async () => {
    const controller = new DnsSniffController({ enableVpnDnsSniff: true }, fakeLogger());
    expect(await controller.captureDnsQueries(null)).toEqual([]);
  });

  it('dry-run mode logs and never shells out', async () => {
    const logger = fakeLogger();
    const controller = new DnsSniffController(
      { enableVpnDnsSniff: true, dryRun: true, pythonBin: 'python3', vpnDnsSniffMs: 500 },
      logger,
    );
    const result = await controller.captureDnsQueries('192.168.1.50');
    expect(result).toEqual([]);
    expect(execFile).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('[dry-run] python dns sniff', { ipAddress: '192.168.1.50' });
  });

  it('parses queried domains from a successful sniff', async () => {
    mockExecFileStdout(JSON.stringify({ ok: true, queries: ['nordvpn.com', 'example.com'] }));
    const controller = new DnsSniffController(
      { enableVpnDnsSniff: true, dryRun: false, pythonBin: 'python3', vpnDnsSniffMs: 500 },
      fakeLogger(),
    );

    const result = await controller.captureDnsQueries('192.168.1.50');
    expect(result).toEqual(['nordvpn.com', 'example.com']);
  });

  it('returns an empty array (never throws) when scapy is unavailable', async () => {
    mockExecFileStdout(JSON.stringify({ ok: false, error: 'scapy unavailable' }));
    const logger = fakeLogger();
    const controller = new DnsSniffController(
      { enableVpnDnsSniff: true, dryRun: false, pythonBin: 'python3', vpnDnsSniffMs: 500 },
      logger,
    );

    const result = await controller.captureDnsQueries('192.168.1.50');
    expect(result).toEqual([]);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('returns an empty array when the subprocess itself fails', async () => {
    execFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      cb(new Error('python not found'));
    });
    const logger = fakeLogger();
    const controller = new DnsSniffController(
      { enableVpnDnsSniff: true, dryRun: false, pythonBin: 'python3', vpnDnsSniffMs: 500 },
      logger,
    );

    const result = await controller.captureDnsQueries('192.168.1.50');
    expect(result).toEqual([]);
    expect(logger.debug).toHaveBeenCalled();
  });

  describe('options override (lets a second caller, e.g. doh-detector.js, reuse this sniff under its own flag/duration)', () => {
    it('stays disabled when config.enableVpnDnsSniff is false but options.enabled is not passed', async () => {
      const controller = new DnsSniffController({ enableVpnDnsSniff: false }, fakeLogger());
      expect(await controller.captureDnsQueries('192.168.1.50', {})).toEqual([]);
      expect(execFile).not.toHaveBeenCalled();
    });

    it('runs when options.enabled is true even though config.enableVpnDnsSniff is false', async () => {
      mockExecFileStdout(JSON.stringify({ ok: true, queries: ['dns.google'] }));
      const controller = new DnsSniffController(
        { enableVpnDnsSniff: false, dryRun: false, pythonBin: 'python3' },
        fakeLogger(),
      );

      const result = await controller.captureDnsQueries('192.168.1.50', { enabled: true, sniffMs: 700 });
      expect(result).toEqual(['dns.google']);
    });

    it('stays disabled when options.enabled is explicitly false even though config.enableVpnDnsSniff is true', async () => {
      const controller = new DnsSniffController({ enableVpnDnsSniff: true }, fakeLogger());
      expect(await controller.captureDnsQueries('192.168.1.50', { enabled: false })).toEqual([]);
      expect(execFile).not.toHaveBeenCalled();
    });

    it('uses options.sniffMs for the subprocess timeout instead of config.vpnDnsSniffMs', async () => {
      mockExecFileStdout(JSON.stringify({ ok: true, queries: [] }));
      const controller = new DnsSniffController(
        { enableVpnDnsSniff: false, dryRun: false, pythonBin: 'python3', vpnDnsSniffMs: 500 },
        fakeLogger(),
      );

      await controller.captureDnsQueries('192.168.1.50', { enabled: true, sniffMs: 700 });

      const call = execFile.mock.calls[0];
      const payload = JSON.parse(call[1][2]);
      expect(payload.sniffMs).toBe(700);
    });
  });
});

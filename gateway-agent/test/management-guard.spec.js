'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { ManagementGuard } = require('../src/management-guard');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

// promisify(execFile) wraps the mocked execFile; make the mock support both
// the (cmd, args, cb) and (cmd, args, opts, cb) call shapes Node's promisify
// may use, returning canned stdout.
function mockExecFileStdout(stdout) {
  execFile.mockImplementation((...args) => {
    const cb = args[args.length - 1];
    cb(null, { stdout, stderr: '' });
  });
}

describe('ManagementGuard', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('protects an explicitly configured management IP without needing detection', () => {
    const guard = new ManagementGuard({ managementIps: ['192.168.1.1'], ipBin: 'ip' }, fakeLogger());
    expect(guard.isProtectedIp('192.168.1.1')).toBe(true);
    expect(guard.isProtectedIp('192.168.1.50')).toBe(false);
  });

  it('detects and protects the dynamic self IP via `ip route get`', async () => {
    mockExecFileStdout('1.1.1.1 via 192.168.1.1 dev eth0 src 192.168.1.2 uid 0\n    cache\n');
    const guard = new ManagementGuard({ managementIps: [], ipBin: 'ip' }, fakeLogger());
    await guard.refresh();
    expect(guard.isProtectedIp('192.168.1.2')).toBe(true);
    expect(guard.isProtectedIp('192.168.1.99')).toBe(false);
  });

  it('never throws when self-IP detection fails (best-effort)', async () => {
    execFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      cb(new Error('command not found'));
    });
    const guard = new ManagementGuard({ managementIps: [], ipBin: 'ip' }, fakeLogger());
    await expect(guard.refresh()).resolves.not.toThrow();
    expect(guard.isProtectedIp('10.0.0.1')).toBe(false);
  });

  it('filterTargets drops protected targets and logs a warning', () => {
    const logger = fakeLogger();
    const guard = new ManagementGuard({ managementIps: ['192.168.1.1'], ipBin: 'ip' }, logger);
    const targets = [
      { deviceId: 'gw-mgmt', ipAddress: '192.168.1.1' },
      { deviceId: 'child-device', ipAddress: '192.168.1.50' },
    ];
    const result = guard.filterTargets(targets);
    expect(result).toEqual([{ deviceId: 'child-device', ipAddress: '192.168.1.50' }]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('filterTargets passes through targets with no ipAddress (nothing to protect against)', () => {
    const guard = new ManagementGuard({ managementIps: ['192.168.1.1'], ipBin: 'ip' }, fakeLogger());
    const targets = [{ deviceId: 'no-ip', ipAddress: null }];
    expect(guard.filterTargets(targets)).toEqual(targets);
  });
});

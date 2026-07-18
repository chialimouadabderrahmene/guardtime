'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { detectOsHint, classifyTtl } = require('../src/os-hint');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function mockPingStdout(stdout) {
  execFile.mockImplementation((...args) => {
    const cb = args[args.length - 1];
    cb(null, { stdout, stderr: '' });
  });
}

describe('classifyTtl', () => {
  it('buckets typical Linux/macOS/iOS/Android TTLs as unix-like', () => {
    expect(classifyTtl(64)).toBe('unix-like');
    expect(classifyTtl(61)).toBe('unix-like');
  });

  it('buckets typical Windows TTLs as windows', () => {
    expect(classifyTtl(128)).toBe('windows');
    expect(classifyTtl(118)).toBe('windows');
  });

  it('buckets high TTLs (routers/network gear) separately', () => {
    expect(classifyTtl(255)).toBe('network-device');
  });

  it('falls back to unknown for very low TTLs (many hops away)', () => {
    expect(classifyTtl(5)).toBe('unknown');
  });
});

describe('detectOsHint', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('returns null when disabled by config (default)', async () => {
    const result = await detectOsHint('192.168.1.50', { enableOsHint: false }, fakeLogger());
    expect(result).toBeNull();
    expect(execFile).not.toHaveBeenCalled();
  });

  it('returns null without an IP address', async () => {
    const result = await detectOsHint(null, { enableOsHint: true, pingBin: 'ping', osHintTimeoutMs: 1000 }, fakeLogger());
    expect(result).toBeNull();
  });

  it('parses ttl= from ping output and classifies it', async () => {
    mockPingStdout('64 bytes from 192.168.1.50: icmp_seq=1 ttl=64 time=1.2 ms\n');
    const result = await detectOsHint(
      '192.168.1.50',
      { enableOsHint: true, pingBin: 'ping', osHintTimeoutMs: 1000 },
      fakeLogger(),
    );
    expect(result).toBe('unix-like');
  });

  it('returns null (never throws) when the device does not answer ICMP', async () => {
    execFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      cb(new Error('100% packet loss'));
    });
    const logger = fakeLogger();
    const result = await detectOsHint(
      '192.168.1.99',
      { enableOsHint: true, pingBin: 'ping', osHintTimeoutMs: 1000 },
      logger,
    );
    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalled();
  });
});

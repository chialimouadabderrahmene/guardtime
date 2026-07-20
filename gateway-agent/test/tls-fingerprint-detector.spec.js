'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { TlsFingerprintDetector } = require('../src/tls-fingerprint-detector');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseConfig(overrides = {}) {
  return {
    pythonBin: 'python3',
    enableTlsFingerprint: true,
    tlsFingerprintSniffMs: 800,
    tlsVpnJa3Hashes: [],
    dryRun: false,
    ...overrides,
  };
}

function mockPython({ stdout = '{"ok": true, "fingerprints": []}', fail } = {}) {
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

describe('TlsFingerprintDetector.captureFingerprints', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('does nothing when enableTlsFingerprint is false', async () => {
    const calls = mockPython();
    const detector = new TlsFingerprintDetector(baseConfig({ enableTlsFingerprint: false }), fakeLogger());

    const result = await detector.captureFingerprints('192.168.1.50');

    expect(result).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('does nothing when no IP address is given', async () => {
    const calls = mockPython();
    const detector = new TlsFingerprintDetector(baseConfig(), fakeLogger());

    const result = await detector.captureFingerprints(null);

    expect(result).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('returns the fingerprints reported by the scapy subprocess', async () => {
    mockPython({ stdout: '{"ok": true, "fingerprints": ["abc123", "def456"]}' });
    const detector = new TlsFingerprintDetector(baseConfig(), fakeLogger());

    const result = await detector.captureFingerprints('192.168.1.50');

    expect(result).toEqual(['abc123', 'def456']);
  });

  it('returns an empty list (does not throw) when the subprocess reports ok:false', async () => {
    mockPython({ stdout: '{"ok": false, "error": "scapy unavailable"}' });
    const detector = new TlsFingerprintDetector(baseConfig(), fakeLogger());

    const result = await detector.captureFingerprints('192.168.1.50');

    expect(result).toEqual([]);
  });

  it('returns an empty list (does not throw) when the subprocess itself fails', async () => {
    mockPython({ fail: true });
    const detector = new TlsFingerprintDetector(baseConfig(), fakeLogger());

    await expect(detector.captureFingerprints('192.168.1.50')).resolves.toEqual([]);
  });

  it('dry-run mode logs instead of spawning python3', async () => {
    const calls = mockPython();
    const logger = fakeLogger();
    const detector = new TlsFingerprintDetector(baseConfig({ dryRun: true }), logger);

    await detector.captureFingerprints('192.168.1.50');

    expect(calls).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith('[dry-run] python tls fingerprint sniff', { ipAddress: '192.168.1.50' });
  });
});

describe('TlsFingerprintDetector.matchKnownSignature', () => {
  it('returns null when the operator denylist is empty (the honest default)', () => {
    const detector = new TlsFingerprintDetector(baseConfig({ tlsVpnJa3Hashes: [] }), fakeLogger());
    expect(detector.matchKnownSignature('abc123')).toBeNull();
  });

  it('matches a hash the operator has explicitly configured', () => {
    const detector = new TlsFingerprintDetector(baseConfig({ tlsVpnJa3Hashes: ['abc123'] }), fakeLogger());
    expect(detector.matchKnownSignature('abc123')).toBe('abc123');
    expect(detector.matchKnownSignature('unrelated')).toBeNull();
  });
});

describe('TlsFingerprintDetector.detectForTarget', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('reports a detection for each captured fingerprint that matches the operator denylist', async () => {
    mockPython({ stdout: '{"ok": true, "fingerprints": ["known-bad", "harmless"]}' });
    const detector = new TlsFingerprintDetector(baseConfig({ tlsVpnJa3Hashes: ['known-bad'] }), fakeLogger());

    const detections = await detector.detectForTarget({ deviceId: 'dev-1', ipAddress: '192.168.1.50' });

    expect(detections).toEqual([{ method: 'tls-ja3-signature', provider: 'unknown-vpn-or-proxy', detail: 'known-bad' }]);
  });

  it('reports nothing when no captured fingerprint is on the denylist', async () => {
    mockPython({ stdout: '{"ok": true, "fingerprints": ["harmless1", "harmless2"]}' });
    const detector = new TlsFingerprintDetector(baseConfig({ tlsVpnJa3Hashes: ['known-bad'] }), fakeLogger());

    const detections = await detector.detectForTarget({ deviceId: 'dev-1', ipAddress: '192.168.1.50' });

    expect(detections).toEqual([]);
  });
});

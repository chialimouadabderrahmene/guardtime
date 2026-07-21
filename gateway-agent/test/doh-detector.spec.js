'use strict';

const { DohDetector } = require('../src/doh-detector');
const { Metrics } = require('../src/metrics');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function target(overrides = {}) {
  return { deviceId: 'dev-1', ipAddress: '192.168.1.50', ...overrides };
}

function buildDetector({ tcpFlows = [], config = {}, dnsSniff = null, now } = {}) {
  const conntrack = { listTcpConnections: jest.fn().mockResolvedValue(tcpFlows) };
  const metrics = new Metrics();
  const logger = fakeLogger();
  const detector = new DohDetector({ conntrack, dnsSniff, config, metrics, logger, now });
  return { detector, conntrack, metrics, logger };
}

describe('DohDetector.sync', () => {
  it('skips targets without a resolved IP address', async () => {
    const { detector, conntrack } = buildDetector();
    const report = await detector.sync([target({ ipAddress: null })]);
    expect(report).toEqual([]);
    expect(conntrack.listTcpConnections).not.toHaveBeenCalled();
  });

  it('flags DoT (port 853) traffic to any destination', async () => {
    const { detector, metrics } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '9.9.9.9', sport: 44000, dport: 853 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'conntrack-port-853', provider: 'DoT', detail: '853', confidence: 95 },
    ]);
    expect(metrics.snapshot()['dohDetector.detections']).toBe(1);
  });

  it('flags a known DoH provider IP on port 443', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '1.1.1.1', sport: 44000, dport: 443 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'conntrack-doh-ip', provider: 'Cloudflare', detail: '1.1.1.1', confidence: 90 },
    ]);
  });

  it('flags an operator-supplied reputation IP on port 443', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '203.0.113.50', sport: 44000, dport: 443 }],
      config: { dohReputationIps: ['203.0.113.50'] },
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'conntrack-doh-ip', provider: 'operator-reputation-list', detail: '203.0.113.50', confidence: 90 },
    ]);
  });

  it('does not flag ordinary port-443 traffic to an unlisted IP', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '93.184.216.34', sport: 44000, dport: 443 }],
    });

    const report = await detector.sync([target()]);
    expect(report).toEqual([]);
  });

  it('never throws when conntrack listing fails', async () => {
    const conntrack = { listTcpConnections: jest.fn().mockRejectedValue(new Error('conntrack unavailable')) };
    const detector = new DohDetector({ conntrack, config: {}, metrics: new Metrics(), logger: fakeLogger() });

    const report = await detector.sync([target()]);
    expect(report).toEqual([]);
  });

  it('logs a warning carrying the confidence for every detection', async () => {
    const { detector, logger } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '9.9.9.9', sport: 44000, dport: 853 }],
    });
    await detector.sync([target()]);
    expect(logger.warn).toHaveBeenCalledWith(
      'encrypted dns (doh/dot) detected',
      expect.objectContaining({ deviceId: 'dev-1', provider: 'DoT', confidence: 95 }),
    );
  });
});

describe('DohDetector — DNS-SNI matching (reuses the DNS sniff, mirrors VpnDetector)', () => {
  it('is skipped entirely when no dnsSniff dependency is wired (backward compatible)', async () => {
    const { detector } = buildDetector({ tcpFlows: [] });
    const report = await detector.sync([target()]);
    expect(report).toEqual([]);
  });

  it('flags a plaintext DNS query for a known DoH hostname', async () => {
    const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue(['dns.google']) };
    const { detector } = buildDetector({ dnsSniff, config: { enableDohDnsSniff: true, dohDnsSniffMs: 500 } });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'dns-sni-pattern', provider: 'dns.google', detail: 'dns.google', confidence: 80 },
    ]);
  });

  it('flags a plaintext DNS query for an operator reputation domain', async () => {
    const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue(['doh.myselfhosted.example']) };
    const { detector } = buildDetector({
      dnsSniff,
      config: { enableDohDnsSniff: true, dohDnsSniffMs: 500, dohReputationDomains: ['myselfhosted.example'] },
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'dns-sni-pattern', provider: 'myselfhosted.example', detail: 'doh.myselfhosted.example', confidence: 80 },
    ]);
  });

  it('passes the DoH-specific enable flag and duration through to captureDnsQueries, not the VPN ones', async () => {
    const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue([]) };
    const { detector } = buildDetector({ dnsSniff, config: { enableDohDnsSniff: true, dohDnsSniffMs: 750 } });

    await detector.sync([target()]);

    expect(dnsSniff.captureDnsQueries).toHaveBeenCalledWith('192.168.1.50', { enabled: true, sniffMs: 750 });
  });

  it('does not flag an ordinary DNS query', async () => {
    const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue(['example.com']) };
    const { detector } = buildDetector({ dnsSniff, config: { enableDohDnsSniff: true } });

    const report = await detector.sync([target()]);
    expect(report).toEqual([]);
  });
});

describe('DohDetector.detectBehavioralInterval — regular-interval TLS/443 heuristic', () => {
  it('returns null before enough observations have accumulated', () => {
    let t = 0;
    const { detector } = buildDetector({ now: () => t });
    t = 0;
    detector._recordObservation('dev-1', '203.0.113.9');
    t = 10000;
    detector._recordObservation('dev-1', '203.0.113.9');
    t = 20000;
    detector._recordObservation('dev-1', '203.0.113.9');

    expect(detector.detectBehavioralInterval('dev-1', '203.0.113.9')).toBeNull();
  });

  it('flags a device with enough perfectly regular observations', () => {
    let t = 0;
    const { detector } = buildDetector({ now: () => t });
    for (let i = 0; i < 5; i += 1) {
      t = i * 10000;
      detector._recordObservation('dev-1', '203.0.113.9');
    }

    const result = detector.detectBehavioralInterval('dev-1', '203.0.113.9');
    expect(result).toEqual({
      method: 'behavioral-interval',
      provider: 'unknown (regular-interval TLS/443)',
      detail: 'dst 203.0.113.9, ~10s interval',
      confidence: 20,
    });
  });

  it('does not flag irregular (high-variance) intervals', () => {
    let t = 0;
    const { detector } = buildDetector({ now: () => t });
    const offsets = [0, 1000, 15000, 16000, 40000];
    for (const offset of offsets) {
      t = offset;
      detector._recordObservation('dev-1', '203.0.113.9');
    }

    expect(detector.detectBehavioralInterval('dev-1', '203.0.113.9')).toBeNull();
  });

  it('does not flag a mean interval below the minimum (rules out ordinary continuous streaming)', () => {
    let t = 0;
    const { detector } = buildDetector({ now: () => t });
    for (let i = 0; i < 5; i += 1) {
      t = i * 200;
      detector._recordObservation('dev-1', '203.0.113.9');
    }

    expect(detector.detectBehavioralInterval('dev-1', '203.0.113.9')).toBeNull();
  });

  it('does not flag a mean interval above the maximum (too infrequent to be a meaningful poll pattern)', () => {
    let t = 0;
    const { detector } = buildDetector({ now: () => t });
    for (let i = 0; i < 5; i += 1) {
      t = i * 600000;
      detector._recordObservation('dev-1', '203.0.113.9');
    }

    expect(detector.detectBehavioralInterval('dev-1', '203.0.113.9')).toBeNull();
  });

  it('trims observation history so memory usage stays bounded', () => {
    let t = 0;
    const { detector } = buildDetector({ now: () => t });
    for (let i = 0; i < 50; i += 1) {
      t = i * 10000;
      detector._recordObservation('dev-1', '203.0.113.9');
    }

    expect(detector._observations.get('dev-1|203.0.113.9').length).toBeLessThanOrEqual(8);
  });
});

describe('DohDetector.sync — behavioral heuristic end-to-end', () => {
  it('flags a device after enough sync() cycles show a regular polling interval to one unlisted destination', async () => {
    let t = 0;
    const conntrack = {
      listTcpConnections: jest.fn().mockImplementation(() =>
        Promise.resolve([{ src: '192.168.1.50', dst: '203.0.113.9', sport: 1, dport: 443 }]),
      ),
    };
    const detector = new DohDetector({ conntrack, config: {}, metrics: new Metrics(), logger: fakeLogger(), now: () => t });

    let lastReport = [];
    for (let i = 0; i < 5; i += 1) {
      t = i * 10000;
      lastReport = await detector.sync([target()]);
    }

    expect(lastReport).toEqual([
      {
        deviceId: 'dev-1',
        method: 'behavioral-interval',
        provider: 'unknown (regular-interval TLS/443)',
        detail: 'dst 203.0.113.9, ~10s interval',
        confidence: 20,
      },
    ]);
  });

  it('does not double-flag a destination that already matched a known/reputation DoH IP', async () => {
    let t = 0;
    const conntrack = {
      listTcpConnections: jest.fn().mockImplementation(() =>
        Promise.resolve([{ src: '192.168.1.50', dst: '1.1.1.1', sport: 1, dport: 443 }]),
      ),
    };
    const detector = new DohDetector({ conntrack, config: {}, metrics: new Metrics(), logger: fakeLogger(), now: () => t });

    let lastReport = [];
    for (let i = 0; i < 5; i += 1) {
      t = i * 10000;
      lastReport = await detector.sync([target()]);
    }

    expect(lastReport).toEqual([
      { deviceId: 'dev-1', method: 'conntrack-doh-ip', provider: 'Cloudflare', detail: '1.1.1.1', confidence: 90 },
    ]);
  });
});

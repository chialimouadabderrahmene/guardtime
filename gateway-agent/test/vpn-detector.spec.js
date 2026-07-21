'use strict';

const { VpnDetector, computeConfidence, detectFlowAnomaly } = require('../src/vpn-detector');
const { Metrics } = require('../src/metrics');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function target(overrides = {}) {
  return { deviceId: 'dev-1', ipAddress: '192.168.1.50', ...overrides };
}

function buildDetector({ udpFlows = [], tcpFlows = [], dnsQueries = [] } = {}) {
  const conntrack = {
    listUdpConnections: jest.fn().mockResolvedValue(udpFlows),
    listTcpConnections: jest.fn().mockResolvedValue(tcpFlows),
  };
  const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue(dnsQueries) };
  const metrics = new Metrics();
  const logger = fakeLogger();
  const detector = new VpnDetector({ conntrack, dnsSniff, metrics, logger });
  return { detector, conntrack, dnsSniff, metrics, logger };
}

describe('VpnDetector.sync', () => {
  it('skips targets without a resolved IP address', async () => {
    const { detector, conntrack } = buildDetector();
    const report = await detector.sync([target({ ipAddress: null })]);
    expect(report).toEqual([]);
    expect(conntrack.listUdpConnections).not.toHaveBeenCalled();
  });

  it('flags a WireGuard port-signature match from a UDP conntrack flow', async () => {
    const { detector, metrics } = buildDetector({
      udpFlows: [{ src: '192.168.1.50', dst: '203.0.113.9', sport: 44000, dport: 51820 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'port-signature', provider: 'WireGuard', detail: '51820', confidence: 90, overallConfidence: 90 },
    ]);
    expect(metrics.snapshot()['vpnDetector.detections']).toBe(1);
  });

  it('flags a known VPN IP-range match', async () => {
    const { detector } = buildDetector({
      udpFlows: [{ src: '192.168.1.50', dst: '162.159.192.10', sport: 44000, dport: 2408 }],
    });

    const report = await detector.sync([target()]);

    // This flow matches BOTH the Cloudflare WARP IP range (85) and its port signature (80);
    // noisy-OR combination: 1 - (1-0.85)(1-0.80) = 0.97 -> 97.
    expect(report).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'ip-range', provider: 'Cloudflare WARP', detail: '162.159.192.10', confidence: 85, overallConfidence: 97 }),
        expect.objectContaining({ method: 'port-signature', provider: 'Cloudflare WARP', detail: '2408', confidence: 80, overallConfidence: 97 }),
      ]),
    );
    expect(report).toHaveLength(2);
  });

  it('flags a DNS-pattern match from a sniffed query', async () => {
    const { detector } = buildDetector({ dnsQueries: ['api.nordvpn.com'] });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'dns-pattern', provider: 'NordVPN', detail: 'api.nordvpn.com', confidence: 85, overallConfidence: 85 },
    ]);
  });

  it('returns no detections for ordinary traffic', async () => {
    const { detector } = buildDetector({
      udpFlows: [{ src: '192.168.1.50', dst: '8.8.8.8', sport: 44000, dport: 443 }],
      dnsQueries: ['example.com'],
    });

    const report = await detector.sync([target()]);
    expect(report).toEqual([]);
  });

  it('logs a warning for every detection', async () => {
    const { detector, logger } = buildDetector({ dnsQueries: ['mullvad.net'] });
    await detector.sync([target()]);
    expect(logger.warn).toHaveBeenCalledWith(
      'vpn detected',
      expect.objectContaining({ deviceId: 'dev-1', provider: 'Mullvad', method: 'dns-pattern', confidence: 85, overallConfidence: 85 }),
    );
  });

  it('never throws when conntrack listing fails, and still checks DNS', async () => {
    const conntrack = {
      listUdpConnections: jest.fn().mockRejectedValue(new Error('conntrack unavailable')),
      listTcpConnections: jest.fn().mockRejectedValue(new Error('conntrack unavailable')),
    };
    const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue(['mullvad.net']) };
    const detector = new VpnDetector({ conntrack, dnsSniff, metrics: new Metrics(), logger: fakeLogger() });

    const report = await detector.sync([target()]);
    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'dns-pattern', provider: 'Mullvad', detail: 'mullvad.net', confidence: 85, overallConfidence: 85 },
    ]);
  });

  it('detects independently across multiple devices', async () => {
    const conntrack = {
      listUdpConnections: jest.fn((ip) =>
        Promise.resolve(ip === '192.168.1.50' ? [{ src: ip, dst: '1.2.3.4', sport: 1, dport: 1194 }] : []),
      ),
      listTcpConnections: jest.fn().mockResolvedValue([]),
    };
    const dnsSniff = { captureDnsQueries: jest.fn().mockResolvedValue([]) };
    const detector = new VpnDetector({ conntrack, dnsSniff, metrics: new Metrics(), logger: fakeLogger() });

    const report = await detector.sync([
      target({ deviceId: 'dev-1', ipAddress: '192.168.1.50' }),
      target({ deviceId: 'dev-2', ipAddress: '192.168.1.51' }),
    ]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'port-signature', provider: 'OpenVPN', detail: '1194', confidence: 90, overallConfidence: 90 },
    ]);
  });

  it('flags a TCP port-signature match (e.g. PPTP) from a TCP conntrack flow', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '203.0.113.9', sport: 44000, dport: 1723 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'port-signature', provider: 'PPTP', detail: '1723', confidence: 80, overallConfidence: 80 },
    ]);
  });

  it('flags a low-confidence detection-only match (e.g. a SOCKS proxy port) distinctly from a high-confidence one', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '203.0.113.9', sport: 44000, dport: 1080 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'port-signature-low-confidence', provider: 'SOCKS proxy', detail: '1080', confidence: 30, overallConfidence: 30 },
    ]);
  });

  it('does not flag ordinary TCP/443 web traffic as anything', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '93.184.216.34', sport: 44000, dport: 443 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([]);
  });

  it('flags a weak flow-heuristic signal (3+ distinct peers on one non-standard UDP port) at low confidence', async () => {
    const { detector } = buildDetector({
      udpFlows: [
        { src: '192.168.1.50', dst: '1.1.1.1', sport: 1, dport: 7000 },
        { src: '192.168.1.50', dst: '2.2.2.2', sport: 1, dport: 7000 },
        { src: '192.168.1.50', dst: '3.3.3.3', sport: 1, dport: 7000 },
      ],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      {
        deviceId: 'dev-1',
        method: 'flow-heuristic',
        provider: 'unknown (multi-peer UDP pattern)',
        detail: 'port 7000, 3 distinct peers',
        weight: 25,
        confidence: 25,
        overallConfidence: 25,
      },
    ]);
  });
});

describe('computeConfidence', () => {
  it('returns 0 for no signals', () => {
    expect(computeConfidence([])).toBe(0);
  });

  it('returns the raw weight for a single signal', () => {
    expect(computeConfidence([90])).toBe(90);
    expect(computeConfidence([25])).toBe(25);
  });

  it('combines multiple signals via noisy-OR, always rising but never exceeding 100', () => {
    // 1 - (1-0.85)(1-0.80) = 0.97 -> 97
    expect(computeConfidence([85, 80])).toBe(97);
    // 1 - (1-0.90)(1-0.90)(1-0.90) = 0.999 -> 100
    expect(computeConfidence([90, 90, 90])).toBe(100);
  });

  it('never exceeds 100 even with many strong signals', () => {
    expect(computeConfidence([95, 95, 95, 95, 95])).toBeLessThanOrEqual(100);
  });
});

describe('detectFlowAnomaly', () => {
  it('returns null when there are fewer than 3 distinct peers on any single non-standard port', () => {
    const flows = [
      { dst: '1.1.1.1', dport: 7000 },
      { dst: '2.2.2.2', dport: 7000 },
    ];
    expect(detectFlowAnomaly(flows)).toBeNull();
  });

  it('flags 3+ distinct peers on the same non-standard port', () => {
    const flows = [
      { dst: '1.1.1.1', dport: 7000 },
      { dst: '2.2.2.2', dport: 7000 },
      { dst: '3.3.3.3', dport: 7000 },
    ];
    const result = detectFlowAnomaly(flows);
    expect(result).toEqual({
      method: 'flow-heuristic',
      provider: 'unknown (multi-peer UDP pattern)',
      detail: 'port 7000, 3 distinct peers',
      weight: 25,
    });
  });

  it('excludes common multi-destination service ports (DNS, DHCP, NTP, HTTPS/QUIC, mDNS)', () => {
    const flows = [
      { dst: '1.1.1.1', dport: 443 },
      { dst: '2.2.2.2', dport: 443 },
      { dst: '3.3.3.3', dport: 443 },
      { dst: '4.4.4.4', dport: 53 },
      { dst: '5.5.5.5', dport: 53 },
      { dst: '6.6.6.6', dport: 53 },
    ];
    expect(detectFlowAnomaly(flows)).toBeNull();
  });

  it('treats different ports independently — peers spread across ports do not combine', () => {
    const flows = [
      { dst: '1.1.1.1', dport: 7000 },
      { dst: '2.2.2.2', dport: 7001 },
      { dst: '3.3.3.3', dport: 7002 },
    ];
    expect(detectFlowAnomaly(flows)).toBeNull();
  });
});

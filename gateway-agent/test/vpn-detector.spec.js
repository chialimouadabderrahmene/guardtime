'use strict';

const { VpnDetector } = require('../src/vpn-detector');
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

    expect(report).toEqual([{ deviceId: 'dev-1', method: 'port-signature', provider: 'WireGuard', detail: '51820' }]);
    expect(metrics.snapshot()['vpnDetector.detections']).toBe(1);
  });

  it('flags a known VPN IP-range match', async () => {
    const { detector } = buildDetector({
      udpFlows: [{ src: '192.168.1.50', dst: '162.159.192.10', sport: 44000, dport: 2408 }],
    });

    const report = await detector.sync([target()]);

    // This flow matches BOTH the Cloudflare WARP IP range and its port signature.
    expect(report).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'ip-range', provider: 'Cloudflare WARP', detail: '162.159.192.10' }),
        expect.objectContaining({ method: 'port-signature', provider: 'Cloudflare WARP', detail: '2408' }),
      ]),
    );
    expect(report).toHaveLength(2);
  });

  it('flags a DNS-pattern match from a sniffed query', async () => {
    const { detector } = buildDetector({ dnsQueries: ['api.nordvpn.com'] });

    const report = await detector.sync([target()]);

    expect(report).toEqual([{ deviceId: 'dev-1', method: 'dns-pattern', provider: 'NordVPN', detail: 'api.nordvpn.com' }]);
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
      expect.objectContaining({ deviceId: 'dev-1', provider: 'Mullvad', method: 'dns-pattern' }),
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
    expect(report).toEqual([{ deviceId: 'dev-1', method: 'dns-pattern', provider: 'Mullvad', detail: 'mullvad.net' }]);
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

    expect(report).toEqual([{ deviceId: 'dev-1', method: 'port-signature', provider: 'OpenVPN', detail: '1194' }]);
  });

  it('flags a TCP port-signature match (e.g. PPTP) from a TCP conntrack flow', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '203.0.113.9', sport: 44000, dport: 1723 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([{ deviceId: 'dev-1', method: 'port-signature', provider: 'PPTP', detail: '1723' }]);
  });

  it('flags a low-confidence detection-only match (e.g. a SOCKS proxy port) distinctly from a high-confidence one', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '203.0.113.9', sport: 44000, dport: 1080 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([
      { deviceId: 'dev-1', method: 'port-signature-low-confidence', provider: 'SOCKS proxy', detail: '1080' },
    ]);
  });

  it('does not flag ordinary TCP/443 web traffic as anything', async () => {
    const { detector } = buildDetector({
      tcpFlows: [{ src: '192.168.1.50', dst: '93.184.216.34', sport: 44000, dport: 443 }],
    });

    const report = await detector.sync([target()]);

    expect(report).toEqual([]);
  });
});

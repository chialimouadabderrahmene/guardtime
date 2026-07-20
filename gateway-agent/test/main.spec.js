'use strict';

jest.mock('../src/device-discovery', () => ({
  discoverDevices: jest.fn().mockResolvedValue([]),
  resolvePolicyTarget: jest.fn((policy) => ({
    deviceId: policy.deviceId,
    name: policy.name,
    action: policy.action,
    reason: policy.reason ?? null,
    ipAddress: policy.ipAddress ?? null,
    macAddress: policy.macAddress ?? null,
    vpnBlock: policy.vpnBlock ?? false,
    quicBlock: policy.quicBlock ?? false,
  })),
}));

jest.mock('../src/fingerprint', () => ({
  enrichWithFingerprint: jest.fn((devices) => Promise.resolve(devices)),
}));

const { syncOnce, summarize } = require('../src/main');
const { Metrics } = require('../src/metrics');
const logger = require('../src/logger');

function buildDeps({ devices = [], vpnDetections = [], dohDetections = [] } = {}) {
  return {
    backend: {
      getPolicies: jest.fn().mockResolvedValue({ devices }),
      reportDiscovery: jest.fn().mockResolvedValue({}),
      reportVpnDetections: jest.fn().mockResolvedValue({}),
      reportDohDetections: jest.fn().mockResolvedValue({}),
    },
    routerCommandExecutor: {
      maybeRunDetection: jest.fn().mockResolvedValue(undefined),
      sync: jest.fn().mockResolvedValue(undefined),
    },
    firewall: { sync: jest.fn().mockResolvedValue(undefined) },
    connectionKiller: { sync: jest.fn().mockResolvedValue(undefined) },
    vpnDetector: { sync: jest.fn().mockResolvedValue(vpnDetections) },
    dohDetector: { sync: jest.fn().mockResolvedValue(dohDetections) },
    qos: { sync: jest.fn().mockResolvedValue(undefined) },
    managementGuard: {
      refresh: jest.fn().mockResolvedValue(undefined),
      filterTargets: jest.fn((targets) => targets),
    },
    metrics: new Metrics(),
    config: {
      dnsRedirectIp: '10.0.0.1',
      enableDnsRedirect: true,
      enableQuicBlockGlobal: false,
      enableVpnBlock: true,
      enableDohBlock: true,
    },
  };
}

describe('summarize', () => {
  it('counts blocked/throttled/unresolved targets', () => {
    const result = summarize([
      { action: 'BLOCK', ipAddress: null, macAddress: null },
      { action: 'BLOCK', ipAddress: '192.168.1.1' },
      { action: 'THROTTLE' },
      { action: 'ALLOW' },
    ]);
    expect(result).toEqual({ total: 4, blocked: 2, throttled: 1, unresolved: 1 });
  });
});

describe('syncOnce', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes enableQuicBlockGlobal through to firewall.sync', async () => {
    const deps = buildDeps();
    deps.config.enableQuicBlockGlobal = true;

    await syncOnce(deps);

    expect(deps.firewall.sync).toHaveBeenCalledWith(
      expect.objectContaining({ enableQuicBlockGlobal: true }),
    );
  });

  it('records quicBlock.enforced metrics and logs when any device has quic blocking active', async () => {
    const deps = buildDeps({
      devices: [
        { deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', ipAddress: '192.168.1.50', quicBlock: true },
        { deviceId: 'dev-2', name: 'Tablet', action: 'ALLOW', ipAddress: '192.168.1.51', quicBlock: false },
      ],
    });

    await syncOnce(deps);

    expect(logger.info).toHaveBeenCalledWith(
      'quic (udp/443) blocking enforced',
      expect.objectContaining({ devices: 1, global: false }),
    );
  });

  it('does not log quic enforcement when no device has it active', async () => {
    const deps = buildDeps({
      devices: [{ deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', ipAddress: '192.168.1.50', quicBlock: false }],
    });

    await syncOnce(deps);

    expect(logger.info).not.toHaveBeenCalledWith('quic (udp/443) blocking enforced', expect.anything());
  });

  it('skips quic enforcement counting for targets with no resolved IP', async () => {
    const deps = buildDeps({
      devices: [{ deviceId: 'dev-1', name: 'Phone', action: 'ALLOW', ipAddress: null, quicBlock: true }],
    });

    await syncOnce(deps);

    expect(logger.info).not.toHaveBeenCalledWith('quic (udp/443) blocking enforced', expect.anything());
  });

  it('reports vpn detections to the backend only when there are any', async () => {
    const detections = [{ deviceId: 'dev-1', provider: 'NordVPN', method: 'dns-pattern' }];
    const deps = buildDeps({ vpnDetections: detections });

    await syncOnce(deps);

    expect(deps.backend.reportVpnDetections).toHaveBeenCalledWith(detections);
  });

  it('does not call reportVpnDetections when there is nothing to report', async () => {
    const deps = buildDeps({ vpnDetections: [] });
    await syncOnce(deps);
    expect(deps.backend.reportVpnDetections).not.toHaveBeenCalled();
  });

  it('skips the vpn detector entirely when vpn blocking is disabled', async () => {
    const deps = buildDeps();
    deps.config.enableVpnBlock = false;
    await syncOnce(deps);
    expect(deps.vpnDetector.sync).not.toHaveBeenCalled();
  });

  it('reports doh/dot detections to the backend only when there are any', async () => {
    const detections = [{ deviceId: 'dev-1', provider: 'DoT', method: 'conntrack-port-853' }];
    const deps = buildDeps({ dohDetections: detections });

    await syncOnce(deps);

    expect(deps.backend.reportDohDetections).toHaveBeenCalledWith(detections);
  });

  it('does not call reportDohDetections when there is nothing to report', async () => {
    const deps = buildDeps({ dohDetections: [] });
    await syncOnce(deps);
    expect(deps.backend.reportDohDetections).not.toHaveBeenCalled();
  });

  it('skips the doh detector entirely when doh/dot blocking is disabled', async () => {
    const deps = buildDeps();
    deps.config.enableDohBlock = false;
    await syncOnce(deps);
    expect(deps.dohDetector.sync).not.toHaveBeenCalled();
  });

  it('passes dnsRedirectIpv6 and enableDohBlock through to firewall.sync', async () => {
    const deps = buildDeps();
    deps.config.dnsRedirectIpv6 = '2001:db8::1';
    await syncOnce(deps);
    expect(deps.firewall.sync).toHaveBeenCalledWith(
      expect.objectContaining({ dnsRedirectIpv6: '2001:db8::1', enableDohBlock: true }),
    );
  });

  it('filters targets through managementGuard before dispatching to any enforcement stage', async () => {
    const deps = buildDeps({
      devices: [
        { deviceId: 'gw-mgmt', name: 'Router', action: 'BLOCK', ipAddress: '10.0.0.1' },
        { deviceId: 'dev-1', name: 'Phone', action: 'BLOCK', ipAddress: '192.168.1.50' },
      ],
    });
    // Simulate the guard actually stripping the protected device out.
    deps.managementGuard.filterTargets = jest.fn((targets) => targets.filter((t) => t.deviceId !== 'gw-mgmt'));

    await syncOnce(deps);

    expect(deps.managementGuard.filterTargets).toHaveBeenCalled();
    const passedToFirewall = deps.firewall.sync.mock.calls[0][0].targets;
    const passedToConnectionKiller = deps.connectionKiller.sync.mock.calls[0][0];
    const passedToQos = deps.qos.sync.mock.calls[0][0];

    for (const targets of [passedToFirewall, passedToConnectionKiller, passedToQos]) {
      expect(targets.some((t) => t.deviceId === 'gw-mgmt')).toBe(false);
      expect(targets.some((t) => t.deviceId === 'dev-1')).toBe(true);
    }
  });

  it('runs router detection and drains the router command queue every cycle', async () => {
    const deps = buildDeps();
    await syncOnce(deps);
    expect(deps.routerCommandExecutor.maybeRunDetection).toHaveBeenCalledTimes(1);
    expect(deps.routerCommandExecutor.sync).toHaveBeenCalledTimes(1);
  });

  it('logs a warning (does not throw) when router command sync fails', async () => {
    const deps = buildDeps();
    deps.routerCommandExecutor.sync = jest.fn().mockRejectedValue(new Error('backend unreachable'));
    await expect(syncOnce(deps)).resolves.not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith('router command sync failed', { error: 'backend unreachable' });
  });
});

'use strict';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));
const { execFile } = require('node:child_process');

const { QosController } = require('../src/qos-controller');
const { Metrics } = require('../src/metrics');
const { stableId } = require('../src/mark-allocator');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function fakeDnsResolveCache(ipsByCategory = {}) {
  return {
    resolveAll: jest.fn((domains, logger) => {
      // The controller passes bundled domains for the category; tests key
      // their fixture by category name via a second lookup the caller does
      // separately, so here we just return whatever was configured for
      // whichever call comes in (tests only exercise one category at a time).
      const key = Object.keys(ipsByCategory)[0];
      return Promise.resolve(ipsByCategory[key] || []);
    }),
  };
}

function baseConfig(overrides = {}) {
  return {
    tcBin: 'tc',
    dryRun: false,
    enableQos: true,
    qosInterfaces: ['eth0'],
    qosRate: '1kbit',
    qosDefaultRate: '1000mbit',
    enableBandwidthControl: true,
    lanInterface: '',
    wanInterface: '',
    ...overrides,
  };
}

function mockExecFile({ fail } = {}) {
  const calls = [];
  execFile.mockImplementation((cmd, args, optsOrCb, maybeCb) => {
    const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
    calls.push(args);
    if (fail && fail(args)) {
      cb(new Error('simulated tc failure'));
      return;
    }
    cb(null, { stdout: '', stderr: '' });
  });
  return calls;
}

describe('QosController — existing throttle behaviour (preserved)', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('does nothing when qos is disabled', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig({ enableQos: false }), fakeLogger(), new Metrics(), fakeDnsResolveCache());
    await controller.sync([{ deviceId: 'dev-1', action: 'THROTTLE', ipAddress: '192.168.1.50' }]);
    expect(calls).toEqual([]);
  });

  it('does nothing when no qos interfaces are configured', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig({ qosInterfaces: [] }), fakeLogger(), new Metrics(), fakeDnsResolveCache());
    await controller.sync([{ deviceId: 'dev-1', action: 'THROTTLE', ipAddress: '192.168.1.50' }]);
    expect(calls).toEqual([]);
  });

  it('builds the qdisc/class hierarchy and throttle filters for THROTTLE targets', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig(), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([{ deviceId: 'dev-1', action: 'THROTTLE', ipAddress: '192.168.1.50' }]);

    expect(calls).toContainEqual(['qdisc', 'replace', 'dev', 'eth0', 'root', 'handle', '1:', 'htb', 'default', '30']);
    expect(calls.some((a) => a.includes('flowid') && a.includes('1:10') && a.includes('192.168.1.50'))).toBe(true);
  });

  it('does not throttle a non-THROTTLE device', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig(), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }]);

    // The THROTTLE_CLASS (1:10) is always defined by ensureQdisc(); what
    // matters is that no *filter* sends this device's traffic into it.
    expect(calls.some((a) => a[0] === 'filter' && a.includes('1:10') && a.includes('192.168.1.50'))).toBe(false);
  });

  it('adds an ip6 u32 throttle filter for a THROTTLE target with an ipv6Address, when enableIpv6 is set', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig({ enableIpv6: true }), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([{ deviceId: 'dev-1', action: 'THROTTLE', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }]);

    expect(
      calls.some((a) => a.includes('protocol') && a.includes('ipv6') && a.includes('ip6') && a.includes('2001:db8::1') && a.includes('1:10')),
    ).toBe(true);
  });

  it('clears prior ipv6 filters every cycle too, when enableIpv6 is set', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig({ enableIpv6: true }), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([]);

    expect(calls).toContainEqual(['filter', 'del', 'dev', 'eth0', 'protocol', 'ipv6', 'parent', '1:']);
  });

  it('does not touch ip6 filters at all when enableIpv6 is not set', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig(), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([{ deviceId: 'dev-1', action: 'THROTTLE', ipAddress: '192.168.1.50', ipv6Address: '2001:db8::1' }]);

    expect(calls.some((a) => a.includes('ipv6') || a.includes('ip6'))).toBe(false);
  });
});

describe('QosController — Layer 7 bandwidth limits', () => {
  beforeEach(() => {
    execFile.mockReset();
  });

  it('does nothing extra when bandwidth control is disabled', async () => {
    const calls = mockExecFile();
    const controller = new QosController(
      baseConfig({ enableBandwidthControl: false }),
      fakeLogger(),
      new Metrics(),
      fakeDnsResolveCache(),
    );

    await controller.sync([
      { deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50', bandwidthLimits: [{ category: null, downloadKbps: 1000, uploadKbps: 500 }] },
    ]);

    expect(calls.some((a) => a[0] === 'filter' && a.includes('20'))).toBe(false);
  });

  it('applies a device-level (no category) download+upload limit', async () => {
    const calls = mockExecFile();
    const metrics = new Metrics();
    const controller = new QosController(baseConfig(), fakeLogger(), metrics, fakeDnsResolveCache());

    await controller.sync([
      {
        deviceId: 'dev-1',
        action: 'ALLOW',
        ipAddress: '192.168.1.50',
        bandwidthLimits: [{ category: null, downloadKbps: 1000, uploadKbps: 500 }],
      },
    ]);

    expect(calls.some((a) => a.includes('1000kbit'))).toBe(true);
    expect(calls.some((a) => a.includes('500kbit'))).toBe(true);
    expect(calls.some((a) => a.includes('dst') && a.includes('192.168.1.50'))).toBe(true);
    expect(calls.some((a) => a.includes('src') && a.includes('192.168.1.50'))).toBe(true);
    expect(metrics.snapshot()['bandwidth.rulesApplied']).toBeGreaterThan(0);
  });

  it('applies a category-scoped limit matched against resolved category IPs', async () => {
    const calls = mockExecFile();
    const dnsResolveCache = fakeDnsResolveCache({ GAMING: ['203.0.113.5'] });
    const controller = new QosController(baseConfig(), fakeLogger(), new Metrics(), dnsResolveCache);

    await controller.sync([
      {
        deviceId: 'dev-1',
        action: 'ALLOW',
        ipAddress: '192.168.1.50',
        bandwidthLimits: [{ category: 'GAMING', downloadKbps: 512, uploadKbps: 512 }],
      },
    ]);

    expect(dnsResolveCache.resolveAll).toHaveBeenCalled();
    expect(calls.some((a) => a.includes('512kbit'))).toBe(true);
    expect(calls.some((a) => a.includes('203.0.113.5') && a.includes('192.168.1.50'))).toBe(true);
  });

  it('only applies the direction that has a rate set', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig(), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([
      {
        deviceId: 'dev-1',
        action: 'ALLOW',
        ipAddress: '192.168.1.50',
        bandwidthLimits: [{ category: null, downloadKbps: 1000 }],
      },
    ]);

    expect(calls.some((a) => a.includes('1000kbit'))).toBe(true);
    // No upload rate configured, so no additional class/filter beyond the download one.
    const filterCalls = calls.filter((a) => a[0] === 'filter' && a.includes('192.168.1.50'));
    expect(filterCalls).toHaveLength(1);
  });

  it('ignores targets with no bandwidthLimits', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig(), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([{ deviceId: 'dev-1', action: 'ALLOW', ipAddress: '192.168.1.50' }]);

    // prio 20 is the bandwidth-filter marker (distinct from the throttle
    // filters' prio 10/11) — its absence proves no bandwidth rule was applied.
    expect(calls.some((a) => a[0] === 'filter' && a.includes('20'))).toBe(false);
  });

  it('rolls back (removes the qdisc) on that interface when applying a bandwidth rule fails, and records a metric', async () => {
    const bandwidthClassId = `1:${stableId('dev-1:dl', { min: 0x100, max: 0x7fff }).toString(16)}`;
    const calls = mockExecFile({ fail: (args) => args.includes(bandwidthClassId) });
    const logger = fakeLogger();
    const metrics = new Metrics();
    const controller = new QosController(baseConfig(), logger, metrics, fakeDnsResolveCache());

    await controller.sync([
      {
        deviceId: 'dev-1',
        action: 'ALLOW',
        ipAddress: '192.168.1.50',
        bandwidthLimits: [{ category: null, downloadKbps: 1000 }],
      },
    ]);

    expect(calls).toContainEqual(['qdisc', 'del', 'dev', 'eth0', 'root']);
    expect(logger.error).toHaveBeenCalledWith(
      'bandwidth control failed on interface, removing shaping for safety',
      expect.objectContaining({ iface: 'eth0' }),
    );
    expect(metrics.snapshot()['bandwidth.rollback']).toBe(1);
  });

  it('dry-run mode never calls execFile for bandwidth rule application', async () => {
    const calls = mockExecFile();
    const controller = new QosController(baseConfig({ dryRun: true }), fakeLogger(), new Metrics(), fakeDnsResolveCache());

    await controller.sync([
      {
        deviceId: 'dev-1',
        action: 'ALLOW',
        ipAddress: '192.168.1.50',
        bandwidthLimits: [{ category: null, downloadKbps: 1000, uploadKbps: 500 }],
      },
    ]);

    expect(execFile).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

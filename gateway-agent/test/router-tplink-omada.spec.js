'use strict';

const { TplinkOmadaPlugin, getAccessToken, omadaRequest, resolveSiteId } = require('../src/router-integrations/tplink_omada');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.1.1',
    omadacId: 'controller-abc',
    credentials: { clientId: 'client-id', clientSecret: 'client-secret' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

/**
 * `tokenHandler()` -> {errorCode, msg, result}; `apiHandler(method, path, body)` -> {errorCode, msg, result}.
 * Token exchange is any request whose URL contains `/openapi/authorize/token`; everything else is dispatched to apiHandler.
 */
function mockOmada({ tokenHandler, apiHandler }) {
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/openapi/authorize/token')) {
      const payload = tokenHandler ? tokenHandler() : { errorCode: 0, result: { accessToken: 'tok-123' } };
      return { ok: true, json: async () => payload };
    }
    const path = decodeURIComponent(url.split('/openapi/v1')[1]);
    const body = options.body ? JSON.parse(options.body) : undefined;
    const payload = apiHandler ? apiHandler(options.method, path, body) : { errorCode: 0, result: {} };
    return { ok: true, json: async () => payload };
  });
  return calls;
}

describe('getAccessToken', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('exchanges client credentials for an access token', async () => {
    mockOmada({ tokenHandler: () => ({ errorCode: 0, result: { accessToken: 'tok-abc' } }) });
    const token = await getAccessToken(baseCtx());
    expect(token).toBe('tok-abc');
  });

  it('throws when the token exchange returns an errorCode', async () => {
    mockOmada({ tokenHandler: () => ({ errorCode: 1, msg: 'invalid client credentials' }) });
    await expect(getAccessToken(baseCtx())).rejects.toThrow(/invalid client credentials/);
  });
});

describe('omadaRequest / resolveSiteId', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('sends AccessToken authorization built from a fresh token', async () => {
    const calls = mockOmada({ apiHandler: () => ({ errorCode: 0, result: { data: [] } }) });
    await omadaRequest(baseCtx(), 'GET', '/controller-abc/sites');
    const apiCall = calls.find((c) => c.url.includes('/sites'));
    expect(apiCall.options.headers.Authorization).toBe('AccessToken=tok-123');
  });

  it('resolveSiteId picks the first site from the sites list', async () => {
    mockOmada({ apiHandler: () => ({ errorCode: 0, result: { data: [{ siteId: 'site-1' }] } }) });
    const siteId = await resolveSiteId(baseCtx());
    expect(siteId).toBe('site-1');
  });

  it('resolveSiteId respects an explicit ctx.siteId without calling the API', async () => {
    const calls = mockOmada({});
    const siteId = await resolveSiteId(baseCtx({ siteId: 'explicit-site' }));
    expect(siteId).toBe('explicit-site');
    expect(calls.filter((c) => c.url.includes('/sites'))).toHaveLength(0);
  });

  it('throws when ctx.omadacId is missing', async () => {
    const ctx = baseCtx();
    delete ctx.omadacId;
    await expect(resolveSiteId(ctx)).rejects.toThrow(/omadacId is required/);
  });
});

describe('TplinkOmadaPlugin', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('detect() succeeds when the token exchange succeeds', async () => {
    mockOmada({});
    const result = await TplinkOmadaPlugin.detect(baseCtx());
    expect(result.success).toBe(true);
  });

  it('testConnection resolves a site and reports OK', async () => {
    mockOmada({ apiHandler: () => ({ errorCode: 0, result: { data: [{ siteId: 'site-1' }] } }) });
    const result = await TplinkOmadaPlugin.testConnection(baseCtx());
    expect(result).toEqual({ success: true, message: 'Omada Open API connection OK', detail: 'site site-1' });
  });

  it('changeDNS honestly reports no documented WAN-DNS endpoint, without calling fetch', async () => {
    const result = await TplinkOmadaPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no documented WAN DNS-change endpoint/);
    expect(global.fetch).toBeUndefined();
  });

  it('blockMAC calls the client block action and verifies via the client list', async () => {
    let blocked = false;
    mockOmada({
      apiHandler: (method, path) => {
        if (path.includes('/sites') && !path.includes('/clients') && !path.includes('/block')) {
          return { errorCode: 0, result: { data: [{ siteId: 'site-1' }] } };
        }
        if (path.endsWith('/clients/AA:BB:CC:DD:EE:FF/block')) {
          blocked = true;
          return { errorCode: 0, result: {} };
        }
        if (path.includes('/clients?')) {
          return { errorCode: 0, result: { data: [{ mac: 'AA:BB:CC:DD:EE:FF', blocked }] } };
        }
        return { errorCode: 0, result: {} };
      },
    });

    const result = await TplinkOmadaPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF blocked' });
  });

  it('unblockMAC calls the client unblock action and verifies via the client list', async () => {
    let blocked = true;
    mockOmada({
      apiHandler: (method, path) => {
        if (path.includes('/sites') && !path.includes('/clients') && !path.includes('/unblock')) {
          return { errorCode: 0, result: { data: [{ siteId: 'site-1' }] } };
        }
        if (path.endsWith('/clients/AA:BB:CC:DD:EE:FF/unblock')) {
          blocked = false;
          return { errorCode: 0, result: {} };
        }
        if (path.includes('/clients?')) {
          return { errorCode: 0, result: { data: [{ mac: 'AA:BB:CC:DD:EE:FF', blocked }] } };
        }
        return { errorCode: 0, result: {} };
      },
    });

    const result = await TplinkOmadaPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF unblocked' });
  });

  it('applyFirewallRule/removeFirewallRule require a macAddress — Omada has no IP-based rule action', async () => {
    const result = await TplinkOmadaPlugin.applyFirewallRule(baseCtx(), {});
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/macAddress is required/);
  });

  it('disconnectClient reconnects (kicks) an associated client', async () => {
    mockOmada({
      apiHandler: (method, path) => {
        if (path.includes('/sites') && !path.includes('/clients')) return { errorCode: 0, result: { data: [{ siteId: 'site-1' }] } };
        if (path.includes('/clients?')) return { errorCode: 0, result: { data: [{ mac: 'AA:BB:CC:DD:EE:FF' }] } };
        return { errorCode: 0, result: {} };
      },
    });
    const result = await TplinkOmadaPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
  });

  it('disconnectClient reports failure when the client is not currently associated', async () => {
    mockOmada({
      apiHandler: (method, path) => {
        if (path.includes('/sites') && !path.includes('/clients')) return { errorCode: 0, result: { data: [{ siteId: 'site-1' }] } };
        if (path.includes('/clients?')) return { errorCode: 0, result: { data: [] } };
        return { errorCode: 0, result: {} };
      },
    });
    const result = await TplinkOmadaPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
  });

  it('dry-run mode never calls fetch for mutating actions', async () => {
    const result = await TplinkOmadaPlugin.blockMAC(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(global.fetch).toBeUndefined();
  });
});

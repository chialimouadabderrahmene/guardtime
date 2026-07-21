'use strict';

const { ZyxelNebulaPlugin, nebulaRequest, orgId } = require('../src/router-integrations/zyxel_nebula');
const { REQUIRED_METHODS } = require('../src/router-integrations/plugin-interface');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    orgId: 'org-1',
    credentials: { apiKey: 'test-api-key' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

/** `handler(path)` -> response body (object) or throws to simulate a non-2xx. */
function mockNebula(handler) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    const path = url.split('/api/v1')[1];
    calls.push({ url, path, headers: options.headers });
    const body = handler(path);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  });
  return calls;
}

describe('nebulaRequest', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('sends a Bearer token built from ctx.credentials.apiKey', async () => {
    const calls = mockNebula(() => ({ data: [] }));
    await nebulaRequest(baseCtx(), '/organizations');
    expect(calls[0].headers.Authorization).toBe('Bearer test-api-key');
  });

  it('throws when no apiKey is configured', async () => {
    const ctx = baseCtx({ credentials: {} });
    await expect(nebulaRequest(ctx, '/organizations')).rejects.toThrow(/apiKey is required/);
  });

  it('throws with the response message on a non-2xx status', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: 'invalid API key' }) }));
    await expect(nebulaRequest(baseCtx(), '/organizations')).rejects.toThrow(/invalid API key/);
  });
});

describe('orgId', () => {
  it('throws when ctx.orgId is missing', () => {
    const ctx = baseCtx();
    delete ctx.orgId;
    expect(() => orgId(ctx)).toThrow(/orgId is required/);
  });
});

describe('ZyxelNebulaPlugin — real read operations', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('detect() reports how many organizations are visible to this API key', async () => {
    mockNebula(() => ({ data: [{ id: 'org-1' }, { id: 'org-2' }] }));
    const result = await ZyxelNebulaPlugin.detect(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/2 organization/);
  });

  it('detect() reports failure when the API key is rejected', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: 'unauthorized' }) }));
    const result = await ZyxelNebulaPlugin.detect(baseCtx());
    expect(result.success).toBe(false);
  });

  it('testConnection lists sites within the configured organization', async () => {
    mockNebula(() => ({ data: [{ id: 'site-1' }] }));
    const result = await ZyxelNebulaPlugin.testConnection(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/1 site\(s\) in organization org-1/);
  });

  it('health() is a cheap reachability probe with latency', async () => {
    mockNebula(() => ({ data: [] }));
    const result = await ZyxelNebulaPlugin.health(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/\d+ms/);
  });
});

describe('ZyxelNebulaPlugin — honest unsupported-write reporting', () => {
  const mutatingMethods = ['changeDNS', 'pauseDevice', 'resumeDevice', 'applyFirewallRule', 'removeFirewallRule', 'blockMAC', 'unblockMAC', 'disconnectClient'];

  it('implements every REQUIRED_METHODS entry (interface compliance)', () => {
    for (const method of REQUIRED_METHODS) {
      expect(typeof ZyxelNebulaPlugin[method]).toBe('function');
    }
  });

  it.each(mutatingMethods)('%s reports success:false + guideOnly:true, explaining the public API has no write endpoint, without calling fetch', async (method) => {
    delete global.fetch;
    const result = await ZyxelNebulaPlugin[method](baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF', ipAddress: '192.168.1.50', dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.guideOnly).toBe(true);
    expect(result.message).toMatch(/no documented/);
    expect(global.fetch).toBeUndefined();
  });
});

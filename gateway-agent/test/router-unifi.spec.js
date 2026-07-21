'use strict';

const { UniFiPlugin } = require('../src/router-integrations/unifi');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.1.1',
    credentials: { username: 'admin', password: 'secret' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

function fakeHeaders(map = {}) {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => lower[name.toLowerCase()] ?? null };
}

/**
 * `handler(url, options)` returns `{ status, body, headers }`. Login
 * requests hit `/api/auth/login` (UniFi OS) or `/api/login` (legacy);
 * everything else is dispatched by path.
 */
function mockFetch(handler) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url, options });
    const { status, body, headers } = handler(url, options);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: fakeHeaders(headers),
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
    };
  });
  return calls;
}

const UNIFI_OS_LOGIN_HEADERS = { 'set-cookie': 'TOKEN=abc123; Path=/; HttpOnly', 'x-csrf-token': 'csrf-xyz' };
const LEGACY_LOGIN_HEADERS = { 'set-cookie': 'unifises=legacy-session; Path=/' };

describe('UniFiPlugin login', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('logs in via the UniFi OS path first and carries the cookie + CSRF token on subsequent requests', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      return { status: 200, body: { data: [{}] } };
    });

    const result = await UniFiPlugin.testConnection(baseCtx());

    expect(result.success).toBe(true);
    expect(calls[0].url).toBe('https://192.168.1.1/api/auth/login');
    const selfCall = calls.find((c) => c.url.includes('/self'));
    expect(selfCall.options.headers.Cookie).toBe('TOKEN=abc123');
    expect(selfCall.options.headers['X-CSRF-Token']).toBe('csrf-xyz');
    expect(selfCall.url).toContain('/proxy/network/api/s/default/self');
  });

  it('falls back to the legacy controller login path when the UniFi OS path fails', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 404, body: 'not found' };
      if (url.includes('/api/login')) return { status: 200, body: {}, headers: LEGACY_LOGIN_HEADERS };
      return { status: 200, body: { data: [{}] } };
    });

    const result = await UniFiPlugin.testConnection(baseCtx());

    expect(result.success).toBe(true);
    const selfCall = calls.find((c) => c.url.includes('/self'));
    expect(selfCall.url).toBe('https://192.168.1.1/api/s/default/self');
    expect(selfCall.options.headers.Cookie).toBe('unifises=legacy-session');
    expect(selfCall.options.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('skips straight to the legacy path when ctx.unifiOs is explicitly false', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/api/login')) return { status: 200, body: {}, headers: LEGACY_LOGIN_HEADERS };
      return { status: 200, body: { data: [{}] } };
    });

    await UniFiPlugin.testConnection(baseCtx({ unifiOs: false }));

    expect(calls.some((c) => c.url.includes('/api/auth/login'))).toBe(false);
    expect(calls[0].url).toBe('https://192.168.1.1/api/login');
  });

  it('reports failure when both login paths fail', async () => {
    mockFetch(() => ({ status: 401, body: 'unauthorized' }));
    const result = await UniFiPlugin.login(baseCtx());
    expect(result.success).toBe(false);
  });

  it('uses a custom site and port when configured', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      return { status: 200, body: { data: [{}] } };
    });

    await UniFiPlugin.testConnection(baseCtx({ site: 'family', port: 8443 }));

    expect(calls[0].url).toBe('https://192.168.1.1:8443/api/auth/login');
    expect(calls.find((c) => c.url.includes('/self')).url).toContain('/proxy/network/api/s/family/self');
  });
});

describe('UniFiPlugin client (MAC) operations', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('blockMAC issues block-sta and verifies the client is reported blocked', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/cmd/stamgr')) return { status: 200, body: {} };
      if (url.includes('/stat/sta')) return { status: 200, body: { data: [{ mac: 'aa:bb:cc:dd:ee:ff', blocked: true }] } };
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF blocked' });
  });

  it('blockMAC requires a macAddress', async () => {
    const result = await UniFiPlugin.blockMAC(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('unblockMAC issues unblock-sta and verifies the client is no longer blocked', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/cmd/stamgr')) return { status: 200, body: {} };
      if (url.includes('/stat/sta')) return { status: 200, body: { data: [{ mac: 'aa:bb:cc:dd:ee:ff', blocked: false }] } };
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF unblocked' });
  });

  it('disconnectClient (kick-sta) requires the client to be currently associated', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/stat/sta')) return { status: 200, body: { data: [] } };
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not currently associated/);
  });

  it('disconnectClient kicks an associated client', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/stat/sta')) return { status: 200, body: { data: [{ mac: 'aa:bb:cc:dd:ee:ff' }] } };
      if (url.includes('/cmd/stamgr')) return { status: 200, body: {} };
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    const cmdCall = calls.find((c) => c.url.includes('/cmd/stamgr'));
    expect(JSON.parse(cmdCall.options.body)).toEqual({ cmd: 'kick-sta', mac: 'aa:bb:cc:dd:ee:ff' });
  });

  it('pauseDevice/resumeDevice alias to blockMAC/unblockMAC', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/cmd/stamgr')) return { status: 200, body: {} };
      if (url.includes('/stat/sta')) return { status: 200, body: { data: [{ mac: 'aa:bb:cc:dd:ee:ff', blocked: true }] } };
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.pauseDevice(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.message).toMatch(/blocked/);
  });

  it('dry-run mode never calls fetch for a mutating client action', async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    const result = await UniFiPlugin.blockMAC(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('UniFiPlugin firewall rule (IP-based) operations', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('applyFirewallRule creates a drop rule and verifies it via the firewallrule list', async () => {
    let created = false;
    mockFetch((url, options) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/rest/firewallrule') && options.method === 'POST') {
        created = true;
        return { status: 200, body: {} };
      }
      if (url.includes('/rest/firewallrule')) {
        return { status: 200, body: { data: created ? [{ _id: 'r1', src_address: '192.168.1.50', name: 'guardtime:dev-1' }] : [] } };
      }
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50', deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'firewall drop rule added for 192.168.1.50' });
  });

  it('applyFirewallRule requires an ipAddress', async () => {
    const result = await UniFiPlugin.applyFirewallRule(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('removeFirewallRule deletes the matching rule by id', async () => {
    const calls = mockFetch((url, options) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (options.method === 'DELETE') return { status: 200, body: {} };
      return { status: 200, body: { data: [{ _id: 'r9', src_address: '192.168.1.50', name: 'guardtime:dev-1' }] } };
    });

    const result = await UniFiPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.1.50' });
    expect(result).toEqual({ success: true, message: 'firewall drop rule removed for 192.168.1.50' });
    expect(calls.some((c) => c.url.includes('/rest/firewallrule/r9') && c.options.method === 'DELETE')).toBe(true);
  });

  it('removeFirewallRule is a no-op success when no matching rule exists', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      return { status: 200, body: { data: [] } };
    });

    const result = await UniFiPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.1.99' });
    expect(result).toEqual({ success: true, message: 'no firewall drop rule found for 192.168.1.99 (already clear)' });
  });
});

describe('UniFiPlugin changeDNS', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('sets and verifies the network DNS server', async () => {
    let dnsServer = '8.8.8.8';
    mockFetch((url, options) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (options.method === 'PUT') {
        dnsServer = JSON.parse(options.body).name1;
        return { status: 200, body: {} };
      }
      return { status: 200, body: { data: [{ _id: 'dns1', name1: dnsServer }] } };
    });

    const result = await UniFiPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'DNS server set to 1.1.1.1' });
  });

  it('reports failure when the DNS setting object cannot be located', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      return { status: 200, body: { data: [] } };
    });

    const result = await UniFiPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/could not locate/);
  });
});

describe('UniFiPlugin logout', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('logs out via the UniFi OS logout path, carrying the session cookie + CSRF token', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      if (url.includes('/api/auth/logout')) return { status: 200, body: {} };
      return { status: 200, body: {} };
    });

    const result = await UniFiPlugin.logout(baseCtx());
    expect(result).toEqual({ success: true, message: 'UniFi session logged out' });
    const logoutCall = calls.find((c) => c.url.includes('/api/auth/logout'));
    expect(logoutCall.options.headers.Cookie).toBe('TOKEN=abc123');
    expect(logoutCall.options.headers['X-CSRF-Token']).toBe('csrf-xyz');
  });

  it('reports failure when the logout request itself fails', async () => {
    mockFetch((url) => {
      if (url.includes('/api/auth/login')) return { status: 200, body: {}, headers: UNIFI_OS_LOGIN_HEADERS };
      return { status: 500, body: {} };
    });

    const result = await UniFiPlugin.logout(baseCtx());
    expect(result.success).toBe(false);
  });
});

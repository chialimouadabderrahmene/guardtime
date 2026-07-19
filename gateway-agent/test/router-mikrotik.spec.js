'use strict';

const { MikroTikPlugin, restRequest, baseUrl } = require('../src/router-integrations/mikrotik');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.88.1',
    credentials: { username: 'admin', password: 'secret' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

function mockFetch(handler) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url, options });
    const { status, body } = handler(url, options);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  });
  return calls;
}

describe('baseUrl', () => {
  it('defaults to plain HTTP with no port', () => {
    expect(baseUrl(baseCtx())).toBe('http://192.168.88.1/rest');
  });

  it('uses https and a custom port when configured', () => {
    expect(baseUrl(baseCtx({ useHttps: true, port: 443 }))).toBe('https://192.168.88.1:443/rest');
  });
});

describe('restRequest', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('sends HTTP Basic auth and the request body as JSON', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { ok: true } }));
    await restRequest(baseCtx(), 'PATCH', '/ip/dns', { servers: '1.1.1.1' });

    const [{ url, options }] = calls;
    expect(url).toBe('http://192.168.88.1/rest/ip/dns');
    expect(options.method).toBe('PATCH');
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
    expect(options.body).toBe(JSON.stringify({ servers: '1.1.1.1' }));
  });

  it('throws with the RouterOS error message on a non-2xx response', async () => {
    mockFetch(() => ({ status: 400, body: { error: 400, message: 'bad request', detail: 'invalid value' } }));
    await expect(restRequest(baseCtx(), 'GET', '/ip/dns')).rejects.toThrow(/invalid value/);
  });
});

describe('MikroTikPlugin', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('testConnection reports board name + version', async () => {
    mockFetch(() => ({ status: 200, body: { 'board-name': 'RB750Gr3', version: '7.15' } }));
    const result = await MikroTikPlugin.testConnection(baseCtx());
    expect(result).toEqual({ success: true, message: 'RouterOS REST connection OK', detail: 'RB750Gr3 7.15' });
  });

  it('changeDNS verifies and reports success', async () => {
    let servers = '8.8.8.8';
    mockFetch((url, options) => {
      if (options.method === 'PATCH') {
        servers = JSON.parse(options.body).servers;
        return { status: 200, body: {} };
      }
      return { status: 200, body: { servers } };
    });

    const result = await MikroTikPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'DNS server set to 1.1.1.1' });
  });

  it('changeDNS restores the previous value when verification fails', async () => {
    mockFetch(() => ({ status: 200, body: { servers: '8.8.8.8' } }));
    const result = await MikroTikPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/restored previous value/);
  });

  it('applyFirewallRule adds a drop rule and verifies it via the filter list', async () => {
    let created = false;
    mockFetch((url, options) => {
      if (options.method === 'PUT') {
        created = true;
        return { status: 200, body: { '.id': '*1', 'src-address': '192.168.88.50', comment: 'guardtime:dev-1' } };
      }
      return { status: 200, body: created ? [{ '.id': '*1', 'src-address': '192.168.88.50', comment: 'guardtime:dev-1' }] : [] };
    });

    const result = await MikroTikPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.88.50', deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'firewall drop rule added for 192.168.88.50' });
  });

  it('applyFirewallRule requires an ipAddress', async () => {
    const result = await MikroTikPlugin.applyFirewallRule(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('removeFirewallRule deletes the matching rule by id', async () => {
    const calls = mockFetch((url, options) => {
      if (options.method === 'DELETE') return { status: 200, body: {} };
      return { status: 200, body: [{ '.id': '*7', 'src-address': '192.168.88.50', comment: 'guardtime:dev-1' }] };
    });

    const result = await MikroTikPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.88.50' });
    expect(result).toEqual({ success: true, message: 'firewall drop rule removed for 192.168.88.50' });
    expect(calls.some((c) => c.url === 'http://192.168.88.1/rest/ip/firewall/filter/*7' && c.options.method === 'DELETE')).toBe(true);
  });

  it('removeFirewallRule is a no-op success when no matching rule exists', async () => {
    mockFetch(() => ({ status: 200, body: [] }));
    const result = await MikroTikPlugin.removeFirewallRule(baseCtx(), { ipAddress: '192.168.88.99' });
    expect(result).toEqual({ success: true, message: 'no firewall drop rule found for 192.168.88.99 (already clear)' });
  });

  it('blockMAC adds a reject entry to the wireless access-list', async () => {
    mockFetch((url, options) => {
      if (options.method === 'PUT') return { status: 200, body: {} };
      return { status: 200, body: [{ '.id': '*2', 'mac-address': 'AA:BB:CC:DD:EE:FF', action: 'reject' }] };
    });

    const result = await MikroTikPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'MAC AA:BB:CC:DD:EE:FF added to reject access-list' });
  });

  it('unblockMAC deletes the matching access-list entry', async () => {
    mockFetch((url, options) => {
      if (options.method === 'DELETE') return { status: 200, body: {} };
      return { status: 200, body: [{ '.id': '*3', 'mac-address': 'AA:BB:CC:DD:EE:FF', action: 'reject' }] };
    });

    const result = await MikroTikPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
  });

  it('disconnectClient removes the matching wireless registration-table entry', async () => {
    const calls = mockFetch((url, options) => {
      if (options.method === 'DELETE') return { status: 200, body: {} };
      return { status: 200, body: [{ '.id': '*9', 'mac-address': 'AA:BB:CC:DD:EE:FF' }] };
    });

    const result = await MikroTikPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'disconnected wireless client AA:BB:CC:DD:EE:FF' });
    expect(calls.some((c) => c.url.includes('/registration-table/*9') && c.options.method === 'DELETE')).toBe(true);
  });

  it('disconnectClient reports failure when the device is not currently associated', async () => {
    mockFetch(() => ({ status: 200, body: [] }));
    const result = await MikroTikPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not currently associated/);
  });

  it('dry-run mode never calls fetch for mutating actions', async () => {
    mockFetch(() => ({ status: 200, body: {} }));
    const result = await MikroTikPlugin.blockMAC(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('pauseDevice/resumeDevice alias to applyFirewallRule/removeFirewallRule', async () => {
    mockFetch((url, options) => {
      if (options.method === 'PUT') return { status: 200, body: { '.id': '*1' } };
      if (options.method === 'DELETE') return { status: 200, body: {} };
      return { status: 200, body: [{ '.id': '*1', 'src-address': '192.168.88.50', comment: 'guardtime:dev-1' }] };
    });

    const paused = await MikroTikPlugin.pauseDevice(baseCtx(), { ipAddress: '192.168.88.50', deviceId: 'dev-1' });
    expect(paused.message).toMatch(/added/);
    const resumed = await MikroTikPlugin.resumeDevice(baseCtx(), { ipAddress: '192.168.88.50' });
    expect(resumed.message).toMatch(/removed/);
  });
});

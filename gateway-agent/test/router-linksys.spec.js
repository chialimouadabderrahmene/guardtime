'use strict';

const { LinksysPlugin, jnapCall, authHeader } = require('../src/router-integrations/linksys');

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

/** `handler(action, params)` -> `{result: 'OK'|'_ErrorX', output, error}`. */
function mockJnap(handler) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    const action = options.headers['X-JNAP-Action'];
    const params = JSON.parse(options.body);
    calls.push({ url, headers: options.headers, action, params });
    const { result = 'OK', output = {}, error } = handler(action, params) || {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result, output, error }),
    };
  });
  return calls;
}

describe('authHeader', () => {
  it('builds a Basic header from username:password', () => {
    expect(authHeader(baseCtx())).toBe(`Basic ${Buffer.from('admin:secret').toString('base64')}`);
  });

  it('returns null when no credentials are set', () => {
    expect(authHeader(baseCtx({ credentials: undefined }))).toBeNull();
  });
});

describe('jnapCall', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('posts to /JNAP/ with the action in X-JNAP-Action and params as the JSON body', async () => {
    const calls = mockJnap(() => ({ result: 'OK', output: { hello: 'world' } }));
    const out = await jnapCall(baseCtx(), 'core/GetDeviceInfo', { foo: 'bar' });
    expect(out).toEqual({ hello: 'world' });
    expect(calls[0].url).toBe('http://192.168.1.1/JNAP/');
    expect(calls[0].action).toBe('http://linksys.com/jnap/core/GetDeviceInfo');
    expect(calls[0].params).toEqual({ foo: 'bar' });
  });

  it('includes X-JNAP-Authorization by default, omits it when requireAuth is false', async () => {
    const calls = mockJnap(() => ({ result: 'OK' }));
    await jnapCall(baseCtx(), 'core/GetDeviceInfo', {}, { requireAuth: false });
    await jnapCall(baseCtx(), 'core/CheckAdminPassword', {});
    expect(calls[0].headers['X-JNAP-Authorization']).toBeUndefined();
    expect(calls[1].headers['X-JNAP-Authorization']).toBe(authHeader(baseCtx()));
  });

  it('throws when JNAP reports a non-OK result', async () => {
    mockJnap(() => ({ result: '_ErrorUnauthorized', error: 'bad password' }));
    await expect(jnapCall(baseCtx(), 'core/CheckAdminPassword', {})).rejects.toThrow(/_ErrorUnauthorized.*bad password/);
  });

  it('throws on a non-2xx HTTP response', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }));
    await expect(jnapCall(baseCtx(), 'core/GetDeviceInfo', {})).rejects.toThrow(/HTTP 500/);
  });
});

describe('LinksysPlugin', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('detect() reports the device info without requiring auth', async () => {
    mockJnap((action) => {
      if (action.endsWith('GetDeviceInfo')) return { result: 'OK', output: { manufacturer: 'Linksys', modelNumber: 'MR9600' } };
    });
    const result = await LinksysPlugin.detect(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/Linksys MR9600/);
  });

  it('login() validates the admin password via CheckAdminPassword', async () => {
    mockJnap(() => ({ result: 'OK' }));
    const result = await LinksysPlugin.login(baseCtx());
    expect(result.success).toBe(true);
  });

  it('login() reports failure when JNAP rejects the password', async () => {
    mockJnap(() => ({ result: '_ErrorUnauthorized', error: 'invalid password' }));
    const result = await LinksysPlugin.login(baseCtx());
    expect(result.success).toBe(false);
  });

  it('changeDNS sets and verifies the new WAN DNS server', async () => {
    let dns1 = '8.8.8.8';
    mockJnap((action, params) => {
      if (action.endsWith('SetWANSettings')) {
        dns1 = params.wanSettings.dns1;
        return { result: 'OK' };
      }
      if (action.endsWith('GetWANSettings')) return { result: 'OK', output: { wanSettings: { dns1 } } };
    });
    const result = await LinksysPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'WAN DNS set to 1.1.1.1' });
  });

  it('changeDNS restores the previous value when verification fails', async () => {
    mockJnap((action) => {
      if (action.endsWith('SetWANSettings')) return { result: 'OK' };
      if (action.endsWith('GetWANSettings')) return { result: 'OK', output: { wanSettings: { dns1: '8.8.8.8' } } };
    });
    const result = await LinksysPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/restored previous value/);
  });

  it('pauseDevice adds a parental-control block rule and verifies it', async () => {
    let rules = [];
    mockJnap((action, params) => {
      if (action.endsWith('SetParentalControlSettings')) {
        rules = params.rules;
        return { result: 'OK' };
      }
      if (action.endsWith('GetParentalControlSettings')) return { result: 'OK', output: { rules } };
    });
    const result = await LinksysPlugin.pauseDevice(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF', deviceId: 'dev-1' });
    expect(result.success).toBe(true);
    expect(rules).toHaveLength(1);
  });

  it('pauseDevice requires a macAddress', async () => {
    const result = await LinksysPlugin.pauseDevice(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('resumeDevice removes the block rule and verifies removal', async () => {
    let rules = [{ macAddress: 'AA:BB:CC:DD:EE:FF', blockInternet: true }];
    mockJnap((action, params) => {
      if (action.endsWith('SetParentalControlSettings')) {
        rules = params.rules;
        return { result: 'OK' };
      }
      if (action.endsWith('GetParentalControlSettings')) return { result: 'OK', output: { rules } };
    });
    const result = await LinksysPlugin.resumeDevice(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(rules).toHaveLength(0);
  });

  it('blockMAC/unblockMAC manage the MAC filter deny list', async () => {
    let macAddresses = [];
    let macFilterMode = 'Disabled';
    mockJnap((action, params) => {
      if (action.endsWith('SetMACFilterSettings')) {
        macAddresses = params.macAddresses;
        macFilterMode = params.macFilterMode;
        return { result: 'OK' };
      }
      if (action.endsWith('GetMACFilterSettings')) return { result: 'OK', output: { macAddresses, macFilterMode } };
    });

    const blocked = await LinksysPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(blocked.success).toBe(true);
    expect(macAddresses).toEqual(['AA:BB:CC:DD:EE:FF']);

    const unblocked = await LinksysPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(unblocked.success).toBe(true);
    expect(macAddresses).toEqual([]);
  });

  it('applyFirewallRule/removeFirewallRule require a macAddress — JNAP has no IP-based rule action', async () => {
    const applied = await LinksysPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50' });
    expect(applied.success).toBe(false);
    expect(applied.message).toMatch(/macAddress is required/);
  });

  it('applyFirewallRule delegates to blockMAC when a macAddress is given', async () => {
    let macAddresses = [];
    mockJnap((action, params) => {
      if (action.endsWith('SetMACFilterSettings')) {
        macAddresses = params.macAddresses;
        return { result: 'OK' };
      }
      if (action.endsWith('GetMACFilterSettings')) return { result: 'OK', output: { macAddresses, macFilterMode: 'Deny' } };
    });
    const result = await LinksysPlugin.applyFirewallRule(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
  });

  it('disconnectClient honestly reports no documented instant-disconnect action', async () => {
    const result = await LinksysPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no documented instant-disconnect/);
  });

  it('health() probes GetDeviceInfo without requiring credentials', async () => {
    mockJnap(() => ({ result: 'OK', output: {} }));
    const result = await LinksysPlugin.health(baseCtx());
    expect(result.success).toBe(true);
    expect(result.detail).toMatch(/\d+ms/);
  });

  it('dry-run mode never calls fetch for mutating actions', async () => {
    const result = await LinksysPlugin.pauseDevice(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(global.fetch).toBeUndefined();
  });
});

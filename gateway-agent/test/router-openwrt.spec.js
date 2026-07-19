'use strict';

const { OpenWrtPlugin, ubusCall, ubusList, login } = require('../src/router-integrations/openwrt');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.1.1',
    credentials: { username: 'root', password: 'secret' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

const SID = 'session-abc-123';

/**
 * dispatch(object, method, params) -> {rc, data} for a "call" RPC.
 * listResult -> object returned for a "list" RPC (defaults to a session +
 * uci + luci + one hostapd object, matching a typical OpenWrt device).
 */
function mockUbus({ dispatch, listResult } = {}) {
  const calls = [];
  global.fetch = jest.fn(async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);

    if (body.method === 'list') {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: body.id,
          result: listResult ?? { session: {}, uci: {}, luci: {}, 'hostapd.wlan0': {} },
        }),
      };
    }

    const [sid, object, method, params] = body.params;
    if (object === 'session' && method === 'login') {
      return {
        ok: true,
        json: async () => ({ jsonrpc: '2.0', id: body.id, result: [0, { ubus_rpc_session: SID }] }),
      };
    }

    const { rc, data } = dispatch(object, method, params, sid);
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: body.id, result: [rc, data || {}] }) };
  });
  return calls;
}

describe('login', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('returns the session id on success', async () => {
    mockUbus({ dispatch: () => ({ rc: 0, data: {} }) });
    const sid = await login(baseCtx());
    expect(sid).toBe(SID);
  });

  it('throws when the ubus session login rc is non-zero', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', id: 1, result: [6, {}] }), // 6 = UBUS_STATUS_PERMISSION_DENIED
    }));
    await expect(login(baseCtx())).rejects.toThrow(/session login failed/);
  });
});

describe('ubusCall / ubusList', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('ubusCall returns {rc, data} from the ubus wire-format [rc, data] tuple', async () => {
    mockUbus({ dispatch: () => ({ rc: 0, data: { hello: 'world' } }) });
    const result = await ubusCall(baseCtx(), SID, 'system', 'board');
    expect(result).toEqual({ rc: 0, data: { hello: 'world' } });
  });

  it('ubusList returns the raw object-list response', async () => {
    mockUbus({ listResult: { session: {}, uci: {} } });
    const result = await ubusList(baseCtx());
    expect(Object.keys(result.result)).toEqual(['session', 'uci']);
  });
});

describe('OpenWrtPlugin', () => {
  beforeEach(() => {
    delete global.fetch;
  });

  it('detect() confirms a reachable ubus endpoint without needing credentials', async () => {
    mockUbus({});
    const result = await OpenWrtPlugin.detect(baseCtx());
    expect(result.success).toBe(true);
  });

  it('testConnection reports the board description', async () => {
    mockUbus({
      dispatch: (object, method) => {
        if (object === 'system' && method === 'board') {
          return { rc: 0, data: { model: 'Generic MT7621', release: { description: 'OpenWrt 23.05.2' } } };
        }
        return { rc: -1, data: {} };
      },
    });
    const result = await OpenWrtPlugin.testConnection(baseCtx());
    expect(result).toEqual({ success: true, message: 'ubus connection OK', detail: 'OpenWrt 23.05.2' });
  });

  it('changeDNS sets, verifies, and reloads the network service', async () => {
    let dns = ['8.8.8.8'];
    mockUbus({
      dispatch: (object, method, params) => {
        if (object === 'uci' && method === 'get' && params.option === 'dns') return { rc: 0, data: { value: dns } };
        if (object === 'uci' && method === 'set') {
          dns = params.values.dns;
          return { rc: 0, data: {} };
        }
        if (object === 'uci' && method === 'commit') return { rc: 0, data: {} };
        if (object === 'luci' && method === 'setInitAction') return { rc: 0, data: {} };
        return { rc: -1, data: {} };
      },
    });

    const result = await OpenWrtPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'WAN DNS set to 1.1.1.1' });
  });

  it('changeDNS restores the previous value when verification fails', async () => {
    mockUbus({
      dispatch: (object, method, params) => {
        if (object === 'uci' && method === 'get' && params.option === 'dns') return { rc: 0, data: { value: ['8.8.8.8'] } };
        if (object === 'uci' && method === 'set') return { rc: 0, data: {} };
        if (object === 'uci' && method === 'commit') return { rc: 0, data: {} };
        return { rc: -1, data: {} };
      },
    });

    const result = await OpenWrtPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/restored previous value/);
  });

  it('applyFirewallRule adds+commits a uci rule section and verifies it', async () => {
    let sections = {};
    mockUbus({
      dispatch: (object, method, params) => {
        if (object === 'uci' && method === 'add') {
          const id = 'cfg01';
          sections[id] = { '.name': id, '.type': 'rule' };
          return { rc: 0, data: { section: id } };
        }
        if (object === 'uci' && method === 'set') {
          Object.assign(sections[params.section], params.values);
          return { rc: 0, data: {} };
        }
        if (object === 'uci' && method === 'commit') return { rc: 0, data: {} };
        if (object === 'uci' && method === 'get' && params.config === 'firewall' && !params.section) {
          return { rc: 0, data: { values: sections } };
        }
        if (object === 'luci') return { rc: 0, data: {} };
        return { rc: -1, data: {} };
      },
    });

    const result = await OpenWrtPlugin.applyFirewallRule(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF', deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'firewall reject rule "guardtime-dev-1" added' });
  });

  it('applyFirewallRule requires a macAddress or ipAddress', async () => {
    const result = await OpenWrtPlugin.applyFirewallRule(baseCtx(), {});
    expect(result.success).toBe(false);
  });

  it('removeFirewallRule deletes the matching uci section', async () => {
    const sections = { cfg01: { '.name': 'cfg01', '.type': 'rule', name: 'guardtime-dev-1' } };
    const calls = mockUbus({
      dispatch: (object, method, params) => {
        if (object === 'uci' && method === 'get' && params.config === 'firewall' && !params.section) {
          return { rc: 0, data: { values: sections } };
        }
        if (object === 'uci' && method === 'delete') return { rc: 0, data: {} };
        if (object === 'uci' && method === 'commit') return { rc: 0, data: {} };
        if (object === 'luci') return { rc: 0, data: {} };
        return { rc: -1, data: {} };
      },
    });

    const result = await OpenWrtPlugin.removeFirewallRule(baseCtx(), { deviceId: 'dev-1' });
    expect(result).toEqual({ success: true, message: 'firewall reject rule "guardtime-dev-1" removed' });
    const deleteCall = calls.find((c) => c.params && c.params[1] === 'uci' && c.params[2] === 'delete');
    expect(deleteCall.params[3].section).toBe('cfg01');
  });

  it('removeFirewallRule is a no-op success when no matching rule exists', async () => {
    mockUbus({
      dispatch: (object, method, params) => {
        if (object === 'uci' && method === 'get' && params.config === 'firewall' && !params.section) {
          return { rc: 0, data: { values: {} } };
        }
        return { rc: -1, data: {} };
      },
    });

    const result = await OpenWrtPlugin.removeFirewallRule(baseCtx(), { deviceId: 'dev-1' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/already clear/);
  });

  it('disconnectClient kicks the client via every hostapd.* ubus object and reports success if any accepted', async () => {
    mockUbus({
      listResult: { session: {}, 'hostapd.wlan0': {}, 'hostapd.wlan1': {} },
      dispatch: (object, method, params) => {
        if (object === 'hostapd.wlan0' && method === 'del_client') return { rc: -1, data: {} }; // not associated here
        if (object === 'hostapd.wlan1' && method === 'del_client') return { rc: 0, data: {} }; // found here
        return { rc: -1, data: {} };
      },
    });

    const result = await OpenWrtPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'disconnected wifi client AA:BB:CC:DD:EE:FF' });
  });

  it('disconnectClient reports failure when no hostapd interface accepts the kick', async () => {
    mockUbus({
      listResult: { 'hostapd.wlan0': {} },
      dispatch: () => ({ rc: -1, data: {} }),
    });

    const result = await OpenWrtPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
  });

  it('blockMAC/unblockMAC alias to applyFirewallRule/removeFirewallRule keyed by MAC', async () => {
    let sections = {};
    mockUbus({
      dispatch: (object, method, params) => {
        if (object === 'uci' && method === 'add') {
          sections.cfg01 = { '.name': 'cfg01', '.type': 'rule' };
          return { rc: 0, data: { section: 'cfg01' } };
        }
        if (object === 'uci' && method === 'set') {
          Object.assign(sections[params.section], params.values);
          return { rc: 0, data: {} };
        }
        if (object === 'uci' && method === 'commit') return { rc: 0, data: {} };
        if (object === 'uci' && method === 'get' && params.config === 'firewall' && !params.section) {
          return { rc: 0, data: { values: sections } };
        }
        if (object === 'uci' && method === 'delete') {
          delete sections[params.section];
          return { rc: 0, data: {} };
        }
        return { rc: 0, data: {} };
      },
    });

    const blocked = await OpenWrtPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(blocked.success).toBe(true);

    const unblocked = await OpenWrtPlugin.unblockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(unblocked.success).toBe(true);
  });

  it('dry-run mode never calls fetch for mutating actions', async () => {
    mockUbus({ dispatch: () => ({ rc: 0, data: {} }) });
    const result = await OpenWrtPlugin.applyFirewallRule(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

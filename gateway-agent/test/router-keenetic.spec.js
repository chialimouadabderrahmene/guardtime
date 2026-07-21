'use strict';

const { EventEmitter } = require('node:events');

jest.mock('node:http', () => ({ request: jest.fn() }));
const http = require('node:http');

const { KeeneticPlugin, rciRequest, buildDigestHeader, parseDigestChallenge } = require('../src/router-integrations/keenetic');

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

/** Any request without an Authorization header gets a 401 Digest challenge; with one, `respond(options)` answers. */
function mockHttpRequest(respond) {
  const calls = [];
  http.request.mockImplementation((options, callback) => {
    calls.push(options);
    const req = new EventEmitter();
    req.write = jest.fn();
    req.setTimeout = jest.fn();
    req.destroy = jest.fn();
    req.end = jest.fn(() => {
      setImmediate(() => {
        const res = new EventEmitter();
        const hasAuth = !!(options.headers && options.headers.Authorization);
        if (!hasAuth) {
          res.statusCode = 401;
          res.headers = { 'www-authenticate': 'Digest realm="Keenetic", qop="auth", nonce="n1"' };
          callback(res);
          setImmediate(() => res.emit('end'));
          return;
        }
        const { statusCode, body } = respond(options);
        res.statusCode = statusCode;
        res.headers = {};
        callback(res);
        setImmediate(() => {
          res.emit('data', body);
          res.emit('end');
        });
      });
    });
    return req;
  });
  return calls;
}

describe('digest auth helpers', () => {
  it('parses a realm/nonce/qop challenge', () => {
    expect(parseDigestChallenge('Digest realm="Keenetic", qop="auth", nonce="n1"')).toEqual({ realm: 'Keenetic', nonce: 'n1', qop: 'auth' });
  });

  it('builds a digest header with the expected shape', () => {
    const header = buildDigestHeader({ username: 'admin', password: 'secret', method: 'GET', uri: '/rci/show/version', challenge: { realm: 'Keenetic', nonce: 'n1', qop: 'auth' } });
    expect(header).toMatch(/^Digest username="admin", realm="Keenetic", nonce="n1", uri="\/rci\/show\/version", response="[0-9a-f]{32}"/);
  });
});

describe('rciRequest', () => {
  beforeEach(() => http.request.mockReset());

  it('retries with a Digest Authorization header after a 401 challenge and parses JSON', async () => {
    mockHttpRequest(() => ({ statusCode: 200, body: '{"model":"KN-1010"}' }));
    const result = await rciRequest(baseCtx(), 'GET', '/rci/show/version');
    expect(result).toEqual({ model: 'KN-1010' });
  });

  it('throws on a non-2xx response after auth', async () => {
    mockHttpRequest(() => ({ statusCode: 500, body: 'internal error' }));
    await expect(rciRequest(baseCtx(), 'GET', '/rci/show/version')).rejects.toThrow(/failed \(status 500\)/);
  });
});

describe('KeeneticPlugin', () => {
  beforeEach(() => http.request.mockReset());

  it('detect() reports the model from /rci/show/version', async () => {
    mockHttpRequest(() => ({ statusCode: 200, body: '{"model":"KN-1010","hw_id":"0001"}' }));
    const result = await KeeneticPlugin.detect(baseCtx());
    expect(result).toEqual({ success: true, message: 'RCI /rci/show/version reachable', detail: 'KN-1010' });
  });

  it('testConnection reports the release version', async () => {
    mockHttpRequest(() => ({ statusCode: 200, body: '{"release":"4.2.1"}' }));
    const result = await KeeneticPlugin.testConnection(baseCtx());
    expect(result).toEqual({ success: true, message: 'RCI connection OK', detail: '4.2.1' });
  });

  it('changeDNS sets and verifies the new name-server value', async () => {
    let nameServer = '8.8.8.8';
    const written = [];
    http.request.mockImplementation((options, callback) => {
      const req = new EventEmitter();
      req.write = jest.fn((chunk) => written.push(chunk));
      req.setTimeout = jest.fn();
      req.destroy = jest.fn();
      req.end = jest.fn(() => {
        setImmediate(() => {
          const res = new EventEmitter();
          const hasAuth = !!(options.headers && options.headers.Authorization);
          if (!hasAuth) {
            res.statusCode = 401;
            res.headers = { 'www-authenticate': 'Digest realm="Keenetic", qop="auth", nonce="n1"' };
            callback(res);
            setImmediate(() => res.emit('end'));
            return;
          }
          if (options.method === 'POST') {
            const body = JSON.parse(written[written.length - 1]);
            if (body['name-server']) nameServer = body['name-server'];
            res.statusCode = 200;
            callback(res);
            setImmediate(() => {
              res.emit('data', '{}');
              res.emit('end');
            });
            return;
          }
          res.statusCode = 200;
          callback(res);
          setImmediate(() => {
            res.emit('data', JSON.stringify({ 'name-server': nameServer }));
            res.emit('end');
          });
        });
      });
      return req;
    });

    const result = await KeeneticPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'DNS server set to 1.1.1.1' });
  });

  it('blockMAC sets access=deny on the hotspot host and verifies it', async () => {
    let access = 'permit';
    const written = [];
    http.request.mockImplementation((options, callback) => {
      const req = new EventEmitter();
      req.write = jest.fn((chunk) => written.push(chunk));
      req.setTimeout = jest.fn();
      req.destroy = jest.fn();
      req.end = jest.fn(() => {
        setImmediate(() => {
          const res = new EventEmitter();
          const hasAuth = !!(options.headers && options.headers.Authorization);
          if (!hasAuth) {
            res.statusCode = 401;
            res.headers = { 'www-authenticate': 'Digest realm="Keenetic", qop="auth", nonce="n1"' };
            callback(res);
            setImmediate(() => res.emit('end'));
            return;
          }
          if (options.method === 'POST') {
            access = JSON.parse(written[written.length - 1]).access;
          }
          res.statusCode = 200;
          callback(res);
          setImmediate(() => {
            res.emit('data', JSON.stringify({ access }));
            res.emit('end');
          });
        });
      });
      return req;
    });

    const result = await KeeneticPlugin.blockMAC(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'AA:BB:CC:DD:EE:FF blocked' });
  });

  it('applyFirewallRule/removeFirewallRule require a macAddress', async () => {
    const result = await KeeneticPlugin.applyFirewallRule(baseCtx(), { ipAddress: '192.168.1.50' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/macAddress is required/);
  });

  it('disconnectClient honestly reports no documented instant-disconnect action', async () => {
    const result = await KeeneticPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no documented instant-disconnect/);
  });

  it('dry-run mode never calls http.request for mutating actions', async () => {
    const result = await KeeneticPlugin.blockMAC(baseCtx({ dryRun: true }), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(http.request).not.toHaveBeenCalled();
  });
});

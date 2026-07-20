'use strict';

const { BackendClient } = require('../src/backend-client');

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

function client() {
  return new BackendClient({ backendUrl: 'https://api.example.test', gatewayToken: 'tok-123' });
}

describe('BackendClient', () => {
  afterEach(() => {
    delete global.fetch;
  });

  it('sends the gateway token header on every request', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await client().getPolicies();
    expect(calls[0].options.headers['x-gateway-token']).toBe('tok-123');
  });

  it('throws with the backend error message on a non-ok response', async () => {
    mockFetch(() => ({ status: 401, body: { message: 'invalid token' } }));
    await expect(client().getPolicies()).rejects.toThrow(/invalid token/);
  });

  it('reportRouterDetection POSTs the detection payload', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await client().reportRouterDetection({ vendor: 'MikroTik', confidence: 90 });

    expect(calls[0].url).toBe('https://api.example.test/gateway/router/detection');
    expect(calls[0].options.method).toBe('POST');
    expect(JSON.parse(calls[0].options.body)).toEqual({ vendor: 'MikroTik', confidence: 90 });
  });

  it('getRouterCommands GETs the router-commands endpoint', async () => {
    const calls = mockFetch(() => ({ status: 200, body: { commands: [], routerConnection: null } }));
    const result = await client().getRouterCommands();

    expect(calls[0].url).toBe('https://api.example.test/gateway/router-commands');
    expect(calls[0].options.method).toBe('GET');
    expect(result).toEqual({ commands: [], routerConnection: null });
  });

  it('ackRouterCommand POSTs commandId/success/resultData', async () => {
    const calls = mockFetch(() => ({ status: 200, body: {} }));
    await client().ackRouterCommand('cmd-1', true, { strategyUsed: 'DISCONNECT_CLIENT' });

    expect(calls[0].url).toBe('https://api.example.test/gateway/router-commands/ack');
    expect(JSON.parse(calls[0].options.body)).toEqual({
      commandId: 'cmd-1',
      success: true,
      resultData: { strategyUsed: 'DISCONNECT_CLIENT' },
    });
  });

  describe('request signing', () => {
    it('sends a timestamp and an HMAC-SHA256 signature header on every request', async () => {
      const calls = mockFetch(() => ({ status: 200, body: {} }));
      await client().getPolicies();

      const headers = calls[0].options.headers;
      expect(Number(headers['x-gateway-timestamp'])).toBeGreaterThan(0);
      expect(headers['x-gateway-signature']).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces a different signature for a different gateway token (keyed by token)', () => {
      const a = new BackendClient({ backendUrl: 'https://x', gatewayToken: 'token-a' }).signRequest('GET', '/gateway/policies', undefined);
      const b = new BackendClient({ backendUrl: 'https://x', gatewayToken: 'token-b' }).signRequest('GET', '/gateway/policies', undefined);
      expect(a.signature).not.toBe(b.signature);
    });

    it('produces a different signature for a different body', () => {
      const c = client();
      const s1 = c.signRequest('POST', '/gateway/vpn-detections', JSON.stringify({ detections: [] }));
      const s2 = c.signRequest('POST', '/gateway/vpn-detections', JSON.stringify({ detections: [{ deviceId: 'x' }] }));
      expect(s1.signature).not.toBe(s2.signature);
    });
  });

  describe('transient-failure retry', () => {
    it('retries once on a 503 and succeeds on the second attempt', async () => {
      let callCount = 0;
      const calls = mockFetch(() => {
        callCount += 1;
        return callCount === 1 ? { status: 503, body: {} } : { status: 200, body: { ok: true } };
      });

      const result = await client().getPolicies();

      expect(calls).toHaveLength(2);
      expect(result).toEqual({ ok: true });
    });

    it('does not retry a second time — two consecutive failures propagate as an error', async () => {
      mockFetch(() => ({ status: 503, body: {} }));
      await expect(client().getPolicies()).rejects.toThrow(/backend 503/);
    });

    it('does not retry a plain 4xx client error', async () => {
      const calls = mockFetch(() => ({ status: 401, body: { message: 'invalid token' } }));
      await expect(client().getPolicies()).rejects.toThrow();
      expect(calls).toHaveLength(1);
    });
  });
});

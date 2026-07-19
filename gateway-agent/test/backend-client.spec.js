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
});

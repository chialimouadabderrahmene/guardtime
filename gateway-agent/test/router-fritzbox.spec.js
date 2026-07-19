'use strict';

const { EventEmitter } = require('node:events');

jest.mock('node:http', () => ({ request: jest.fn() }));
const http = require('node:http');

const {
  FritzBoxPlugin,
  discoverServices,
  soapAction,
  buildDigestHeader,
  parseDigestChallenge,
} = require('../src/router-integrations/fritzbox');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function baseCtx(overrides = {}) {
  return {
    ipAddress: '192.168.178.1',
    credentials: { username: 'admin', password: 'secret' },
    logger: fakeLogger(),
    dryRun: false,
    ...overrides,
  };
}

const TR64_DESC_XML = `<?xml version="1.0"?>
<root>
  <device>
    <serviceList>
      <service>
        <serviceType>urn:dslforum-org:service:DeviceInfo:1</serviceType>
        <controlURL>/upnp/control/deviceinfo</controlURL>
      </service>
      <service>
        <serviceType>urn:dslforum-org:service:Hosts:1</serviceType>
        <controlURL>/upnp/control/hosts</controlURL>
      </service>
      <service>
        <serviceType>urn:dslforum-org:service:X_AVM-DE_HostFilter:1</serviceType>
        <controlURL>/upnp/control/hostfilter</controlURL>
      </service>
      <service>
        <serviceType>urn:dslforum-org:service:LANHostConfigManagement:1</serviceType>
        <controlURL>/upnp/control/lanhostconfig</controlURL>
      </service>
    </serviceList>
  </device>
</root>`;

/**
 * Simulates a real FRITZ!Box: any request without an Authorization header
 * gets a 401 + WWW-Authenticate challenge; requests WITH one get resolved
 * via `respond(options)`, which the test supplies per-path/SOAPAction.
 */
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
          res.headers = { 'www-authenticate': 'Digest realm="FRITZ!Box", qop="auth", nonce="abc123nonce"' };
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

describe('digest auth helpers (pure functions)', () => {
  it('parses a realm/nonce/qop/opaque challenge', () => {
    const challenge = parseDigestChallenge('Digest realm="FRITZ!Box", qop="auth", nonce="n1", opaque="o1"');
    expect(challenge).toEqual({ realm: 'FRITZ!Box', nonce: 'n1', qop: 'auth', opaque: 'o1' });
  });

  it('returns null for a header with no realm/nonce', () => {
    expect(parseDigestChallenge('Basic realm="x"')).toBeNull();
    expect(parseDigestChallenge('')).toBeNull();
  });

  it('builds a deterministic digest header shape (qop present)', () => {
    const header = buildDigestHeader({
      username: 'admin',
      password: 'secret',
      method: 'GET',
      uri: '/tr64desc.xml',
      challenge: { realm: 'FRITZ!Box', nonce: 'n1', qop: 'auth' },
    });
    expect(header).toMatch(/^Digest username="admin", realm="FRITZ!Box", nonce="n1", uri="\/tr64desc\.xml", response="[0-9a-f]{32}"/);
    expect(header).toMatch(/qop=auth, nc=00000001, cnonce="[0-9a-f]{16}"/);
  });
});

describe('discoverServices', () => {
  beforeEach(() => http.request.mockReset());

  it('parses serviceType -> controlURL from tr64desc.xml', async () => {
    mockHttpRequest(() => ({ statusCode: 200, body: TR64_DESC_XML }));
    const services = await discoverServices(baseCtx());
    expect(services.get('urn:dslforum-org:service:DeviceInfo:1')).toBe('/upnp/control/deviceinfo');
    expect(services.get('urn:dslforum-org:service:X_AVM-DE_HostFilter:1')).toBe('/upnp/control/hostfilter');
  });

  it('throws when tr64desc.xml is unreachable', async () => {
    mockHttpRequest(() => ({ statusCode: 500, body: '' }));
    await expect(discoverServices(baseCtx())).rejects.toThrow(/failed to fetch tr64desc/);
  });
});

describe('soapAction', () => {
  beforeEach(() => http.request.mockReset());

  it('sends the correct SOAPAction header and envelope, and parses New* out-params', async () => {
    const calls = mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      return {
        statusCode: 200,
        body: '<s:Envelope><s:Body><u:GetInfoResponse><NewModelName>FRITZ!Box 7590</NewModelName></u:GetInfoResponse></s:Body></s:Envelope>',
      };
    });

    const out = await soapAction(baseCtx(), 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo');

    expect(out.NewModelName).toBe('FRITZ!Box 7590');
    const soapCall = calls.find((c) => c.path === '/upnp/control/deviceinfo');
    expect(soapCall.headers.SOAPAction).toBe('"urn:dslforum-org:service:DeviceInfo:1#GetInfo"');
  });

  it('throws with the FRITZ!Box error description on a SOAP fault', async () => {
    mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      return { statusCode: 500, body: '<errorDescription>Invalid Action</errorDescription>' };
    });

    await expect(soapAction(baseCtx(), 'urn:dslforum-org:service:DeviceInfo:1', 'GetInfo')).rejects.toThrow(/Invalid Action/);
  });

  it('throws when the requested service is not in the device description', async () => {
    mockHttpRequest(() => ({ statusCode: 200, body: TR64_DESC_XML }));
    await expect(soapAction(baseCtx(), 'urn:dslforum-org:service:NotReal:1', 'Foo')).rejects.toThrow(/does not expose service/);
  });
});

describe('FritzBoxPlugin', () => {
  beforeEach(() => http.request.mockReset());

  it('testConnection succeeds and reports the model name', async () => {
    mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      return {
        statusCode: 200,
        body: '<u:GetInfoResponse><NewModelName>FRITZ!Box 7590</NewModelName></u:GetInfoResponse>',
      };
    });

    const result = await FritzBoxPlugin.testConnection(baseCtx());
    expect(result).toEqual({ success: true, message: 'TR-064 connection OK', detail: 'FRITZ!Box 7590' });
  });

  it('detect() confirms a FRITZ!Box from the device description body', async () => {
    mockHttpRequest(() => ({ statusCode: 200, body: TR64_DESC_XML.replace('<root>', '<root><manufacturer>AVM</manufacturer>') }));
    const result = await FritzBoxPlugin.detect(baseCtx());
    expect(result.success).toBe(true);
  });

  it('changeDNS verifies the new value and reports success', async () => {
    let dnsServers = '8.8.8.8';
    mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      if (/SetDNSServers/.test(options.headers.SOAPAction)) {
        dnsServers = '1.1.1.1';
        return { statusCode: 200, body: '<u:SetDNSServersResponse></u:SetDNSServersResponse>' };
      }
      return { statusCode: 200, body: `<u:GetDNSServersResponse><NewDNSServers>${dnsServers}</NewDNSServers></u:GetDNSServersResponse>` };
    });

    const result = await FritzBoxPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result).toEqual({ success: true, message: 'DNS server set to 1.1.1.1' });
  });

  it('changeDNS restores the previous value and reports failure when verification does not match', async () => {
    mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      return { statusCode: 200, body: '<u:GetDNSServersResponse><NewDNSServers>8.8.8.8</NewDNSServers></u:GetDNSServersResponse>' };
    });

    const result = await FritzBoxPlugin.changeDNS(baseCtx(), { dnsServer: '1.1.1.1' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/restored previous value/);
  });

  it('applyFirewallRule resolves an IP from a MAC address and disallows WAN access', async () => {
    mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      if (/GetSpecificHostEntry/.test(options.headers.SOAPAction)) {
        return { statusCode: 200, body: '<u:GetSpecificHostEntryResponse><NewIPAddress>192.168.178.50</NewIPAddress></u:GetSpecificHostEntryResponse>' };
      }
      return { statusCode: 200, body: '<u:DisallowWANAccessByIPResponse></u:DisallowWANAccessByIPResponse>' };
    });

    const result = await FritzBoxPlugin.applyFirewallRule(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result).toEqual({ success: true, message: 'WAN access disallowed for 192.168.178.50' });
  });

  it('pauseDevice/blockMAC alias to applyFirewallRule; resumeDevice/unblockMAC alias to removeFirewallRule', async () => {
    mockHttpRequest((options) => {
      if (options.path === '/tr64desc.xml') return { statusCode: 200, body: TR64_DESC_XML };
      return { statusCode: 200, body: '<u:DisallowWANAccessByIPResponse></u:DisallowWANAccessByIPResponse>' };
    });

    const paused = await FritzBoxPlugin.pauseDevice(baseCtx(), { ipAddress: '192.168.178.51' });
    expect(paused.message).toMatch(/disallowed/);

    const resumed = await FritzBoxPlugin.resumeDevice(baseCtx(), { ipAddress: '192.168.178.51' });
    expect(resumed.message).toMatch(/restored/);
  });

  it('disconnectClient always reports unsupported — no documented TR-064 action exists', async () => {
    const result = await FritzBoxPlugin.disconnectClient(baseCtx(), { macAddress: 'AA:BB:CC:DD:EE:FF' });
    expect(result.success).toBe(false);
    expect(http.request).not.toHaveBeenCalled();
  });

  it('dry-run mode never calls http.request for mutating actions', async () => {
    const result = await FritzBoxPlugin.applyFirewallRule(baseCtx({ dryRun: true }), { ipAddress: '192.168.178.50' });
    expect(result.success).toBe(true);
    expect(result.message).toMatch(/^\[dry-run\]/);
    expect(http.request).not.toHaveBeenCalled();
  });
});

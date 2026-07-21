'use strict';

// AVM FRITZ!Box — TR-064 (SOAP over HTTP, HTTP Digest auth), officially
// documented by AVM at https://fritz.com/en/pages/interfaces ("TR-064 —
// First Steps"). Control URLs are discovered from the device's own
// tr64desc.xml service list on every call (as TR-064 clients are specified
// to do) rather than hardcoded, since AVM does not publish them as a fixed
// contract and some have changed across firmware versions historically.

const http = require('node:http');
const crypto = require('node:crypto');

const TR064_PORT = 49000;
const DEVICE_INFO_SERVICE = 'urn:dslforum-org:service:DeviceInfo:1';
const HOSTS_SERVICE = 'urn:dslforum-org:service:Hosts:1';
const HOST_FILTER_SERVICE = 'urn:dslforum-org:service:X_AVM-DE_HostFilter:1';
const LAN_HOST_CONFIG_SERVICE = 'urn:dslforum-org:service:LANHostConfigManagement:1';

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('TR-064 request timed out')));
    if (body) req.write(body);
    req.end();
  });
}

function parseDigestChallenge(wwwAuthenticate) {
  const realm = /realm="([^"]+)"/.exec(wwwAuthenticate || '')?.[1];
  const nonce = /nonce="([^"]+)"/.exec(wwwAuthenticate || '')?.[1];
  const qop = /qop="?([^",]+)"?/.exec(wwwAuthenticate || '')?.[1];
  const opaque = /opaque="([^"]+)"/.exec(wwwAuthenticate || '')?.[1];
  if (!realm || !nonce) return null;
  return { realm, nonce, qop, opaque };
}

function buildDigestHeader({ username, password, method, uri, challenge }) {
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = crypto.createHash('md5').update(`${username}:${challenge.realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  const responseParts = challenge.qop
    ? [ha1, challenge.nonce, nc, cnonce, challenge.qop, ha2]
    : [ha1, challenge.nonce, ha2];
  const response = crypto.createHash('md5').update(responseParts.join(':')).digest('hex');

  let header = `Digest username="${username}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${response}"`;
  if (challenge.qop) header += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (challenge.opaque) header += `, opaque="${challenge.opaque}"`;
  return header;
}

/** One HTTP request, retried once with a Digest Authorization header if the FRITZ!Box challenges it. */
async function digestRequest(ctx, { method, path, body, contentType, extraHeaders }) {
  const { ipAddress, credentials } = ctx;
  const baseOptions = {
    hostname: ipAddress,
    port: TR064_PORT,
    path,
    method,
    headers: { ...(contentType ? { 'Content-Type': contentType } : {}), ...(extraHeaders || {}) },
  };

  const first = await httpRequest(baseOptions, body);
  if (first.statusCode !== 401) return first;

  const challenge = parseDigestChallenge(first.headers['www-authenticate']);
  if (!challenge || !credentials?.username) return first;

  const authHeader = buildDigestHeader({
    username: credentials.username,
    password: credentials.password || '',
    method,
    uri: path,
    challenge,
  });

  return httpRequest({ ...baseOptions, headers: { ...baseOptions.headers, Authorization: authHeader } }, body);
}

/** TR-064 clients discover control URLs from the device's own service list rather than assuming fixed paths. */
async function discoverServices(ctx) {
  const result = await digestRequest(ctx, { method: 'GET', path: '/tr64desc.xml' });
  if (result.statusCode !== 200) {
    throw new Error(`failed to fetch tr64desc.xml (status ${result.statusCode})`);
  }
  const services = new Map();
  const serviceBlockRe = /<service>([\s\S]*?)<\/service>/g;
  let match;
  while ((match = serviceBlockRe.exec(result.body))) {
    const block = match[1];
    const serviceType = /<serviceType>([^<]+)<\/serviceType>/.exec(block)?.[1];
    const controlUrl = /<controlURL>([^<]+)<\/controlURL>/.exec(block)?.[1];
    if (serviceType && controlUrl) services.set(serviceType, controlUrl);
  }
  return services;
}

async function soapAction(ctx, serviceType, action, params = {}) {
  const services = await discoverServices(ctx);
  const controlUrl = services.get(serviceType);
  if (!controlUrl) throw new Error(`FRITZ!Box does not expose service ${serviceType}`);

  const paramsXml = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
    .join('');
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${serviceType}">${paramsXml}</u:${action}></s:Body></s:Envelope>`;

  const result = await digestRequest(ctx, {
    method: 'POST',
    path: controlUrl,
    body: envelope,
    contentType: 'text/xml; charset="utf-8"',
    extraHeaders: { SOAPAction: `"${serviceType}#${action}"` },
  });

  if (result.statusCode !== 200) {
    const faultString = /<errorDescription>([^<]+)<\/errorDescription>/.exec(result.body)?.[1];
    throw new Error(`TR-064 ${action} failed (status ${result.statusCode}): ${faultString || result.body.slice(0, 200)}`);
  }

  const outParams = {};
  const paramRe = /<(New[A-Za-z0-9]+)>([^<]*)<\/\1>/g;
  let paramMatch;
  while ((paramMatch = paramRe.exec(result.body))) {
    outParams[paramMatch[1]] = paramMatch[2];
  }
  return outParams;
}

async function resolveIpFromMac(ctx, macAddress) {
  const out = await soapAction(ctx, HOSTS_SERVICE, 'GetSpecificHostEntry', { NewMACAddress: macAddress });
  return out.NewIPAddress || null;
}

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] fritzbox: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

const FritzBoxPlugin = {
  async detect(ctx) {
    try {
      const result = await digestRequest(ctx, { method: 'GET', path: '/tr64desc.xml' });
      const isFritzBox = result.statusCode === 200 && /AVM|FRITZ!?Box/i.test(result.body);
      return isFritzBox
        ? { success: true, message: 'FRITZ!Box TR-064 device description confirmed' }
        : { success: false, message: 'tr64desc.xml did not identify as a FRITZ!Box' };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    return FritzBoxPlugin.testConnection(ctx);
  },

  /** No documented TR-064 session-logout action — HTTP Digest auth is stateless per-request, so there is no server-side session to invalidate. */
  async logout() {
    return { success: true, message: 'TR-064 uses stateless per-request Digest auth — no session to log out of' };
  },

  /** Cheap, unauthenticated reachability probe (tr64desc.xml challenges but does not require valid credentials to reach) — distinct from the authenticated testConnection() above. */
  async health(ctx) {
    const startedAt = Date.now();
    try {
      const result = await httpRequest({ hostname: ctx.ipAddress, port: TR064_PORT, path: '/tr64desc.xml', method: 'GET' });
      const latencyMs = Date.now() - startedAt;
      return result.statusCode === 200 || result.statusCode === 401
        ? { success: true, message: 'TR-064 endpoint reachable', detail: `${latencyMs}ms` }
        : { success: false, message: `unexpected status ${result.statusCode}`, detail: `${latencyMs}ms` };
    } catch (err) {
      return { success: false, message: `health check failed: ${err.message}` };
    }
  },

  async testConnection(ctx) {
    try {
      const out = await soapAction(ctx, DEVICE_INFO_SERVICE, 'GetInfo');
      return {
        success: true,
        message: 'TR-064 connection OK',
        detail: out.NewModelName || out.NewSoftwareVersion || undefined,
      };
    } catch (err) {
      return { success: false, message: `TR-064 connection failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set DNS server to ${dnsServer}`);
    if (dry) return dry;

    try {
      const before = await soapAction(ctx, LAN_HOST_CONFIG_SERVICE, 'GetDNSServers').catch(() => ({}));
      await soapAction(ctx, LAN_HOST_CONFIG_SERVICE, 'SetDNSServers', { NewDNSServers: dnsServer });
      const after = await soapAction(ctx, LAN_HOST_CONFIG_SERVICE, 'GetDNSServers').catch(() => ({}));

      if (after.NewDNSServers && after.NewDNSServers.includes(dnsServer)) {
        return { success: true, message: `DNS server set to ${dnsServer}` };
      }
      if (before.NewDNSServers) {
        await soapAction(ctx, LAN_HOST_CONFIG_SERVICE, 'SetDNSServers', { NewDNSServers: before.NewDNSServers }).catch(() => {});
      }
      return { success: false, message: 'DNS change did not verify — restored previous value' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return FritzBoxPlugin.applyFirewallRule(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return FritzBoxPlugin.removeFirewallRule(ctx, target);
  },

  async disconnectClient() {
    return {
      success: false,
      message:
        'FRITZ!Box TR-064 has no documented client-disconnect action — X_AVM-DE_HostFilter only supports allow/disallow WAN access, not forcing a Wi-Fi client off.',
    };
  },

  async applyFirewallRule(ctx, { macAddress, ipAddress } = {}) {
    const dry = dryRunResult(ctx, `disallow WAN access for ${ipAddress || macAddress}`);
    if (dry) return dry;

    try {
      const targetIp = ipAddress || (macAddress ? await resolveIpFromMac(ctx, macAddress) : null);
      if (!targetIp) return { success: false, message: 'could not resolve an IP address for this device' };
      await soapAction(ctx, HOST_FILTER_SERVICE, 'DisallowWANAccessByIP', { NewIPv4Address: targetIp, NewDisallow: '1' });
      return { success: true, message: `WAN access disallowed for ${targetIp}` };
    } catch (err) {
      return { success: false, message: `applyFirewallRule failed: ${err.message}` };
    }
  },

  async removeFirewallRule(ctx, { macAddress, ipAddress } = {}) {
    const dry = dryRunResult(ctx, `restore WAN access for ${ipAddress || macAddress}`);
    if (dry) return dry;

    try {
      const targetIp = ipAddress || (macAddress ? await resolveIpFromMac(ctx, macAddress) : null);
      if (!targetIp) return { success: false, message: 'could not resolve an IP address for this device' };
      await soapAction(ctx, HOST_FILTER_SERVICE, 'DisallowWANAccessByIP', { NewIPv4Address: targetIp, NewDisallow: '0' });
      return { success: true, message: `WAN access restored for ${targetIp}` };
    } catch (err) {
      return { success: false, message: `removeFirewallRule failed: ${err.message}` };
    }
  },

  async blockMAC(ctx, { macAddress } = {}) {
    return FritzBoxPlugin.applyFirewallRule(ctx, { macAddress });
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    return FritzBoxPlugin.removeFirewallRule(ctx, { macAddress });
  },
};

module.exports = { FritzBoxPlugin, discoverServices, soapAction, buildDigestHeader, parseDigestChallenge };

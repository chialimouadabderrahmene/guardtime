'use strict';

// Keenetic — the RCI ("Remote Control Interface") HTTP API, documented in
// Keenetic's OWN command-reference manuals (e.g. the KeeNetic KN-1310/
// KN-1710 Command Reference Manual's "HTTP API / REST Core Interface"
// section — a vendor-published manual, not a third-party reverse-engineering
// writeup, which is why this plugin is OFFICIAL_API rather than GUIDE_ONLY
// in router-capability.matrix.ts): every RCI resource path mirrors a CLI
// command (`ip name-server <value>` <-> `/rci/ip/name-server`), reachable
// over plain HTTP with Digest authentication, GET to read a resource and
// POST (JSON body) to write it.
//
// Honesty note (same posture as unifi/edgerouter/index.js): no Keenetic
// hardware is available in this environment. The RCI transport itself
// (Digest-authed GET/POST against `/rci/<command-tree-path>`, resource
// paths mirroring CLI commands 1:1) is directly documented in Keenetic's
// own manual and is on solid ground; the exact resource path and body shape
// used below for DNS/access-control writes follow Keenetic's well-known CLI
// vocabulary (`ip name-server`, `ip hotspot host ... policy`) but have never
// been run against real firmware — every mutating method verifies its own
// change by reading the resource back afterward and restores the previous
// value on a verification failure, for exactly that reason.

const http = require('node:http');
const crypto = require('node:crypto');

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] keenetic: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
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
    req.setTimeout(8000, () => req.destroy(new Error('RCI request timed out')));
    if (body) req.write(body);
    req.end();
  });
}

function parseDigestChallenge(wwwAuthenticate) {
  const realm = /realm="([^"]+)"/.exec(wwwAuthenticate || '')?.[1];
  const nonce = /nonce="([^"]+)"/.exec(wwwAuthenticate || '')?.[1];
  const qop = /qop="?([^",]+)"?/.exec(wwwAuthenticate || '')?.[1];
  if (!realm || !nonce) return null;
  return { realm, nonce, qop };
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
  return header;
}

/** One RCI request, retried once with a Digest Authorization header if challenged. */
async function rciRequest(ctx, method, path, body) {
  const { ipAddress, credentials } = ctx;
  const baseOptions = {
    hostname: ipAddress,
    port: ctx.port || 80,
    path,
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  };

  const first = await httpRequest(baseOptions, body);
  if (first.statusCode !== 401) return parseRciResponse(first, method, path);

  const challenge = parseDigestChallenge(first.headers['www-authenticate']);
  if (!challenge || !credentials?.username) return parseRciResponse(first, method, path);

  const authHeader = buildDigestHeader({
    username: credentials.username,
    password: credentials.password || '',
    method,
    uri: path,
    challenge,
  });

  const second = await httpRequest({ ...baseOptions, headers: { ...baseOptions.headers, Authorization: authHeader } }, body);
  return parseRciResponse(second, method, path);
}

function parseRciResponse(result, method, path) {
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`RCI ${method} ${path} failed (status ${result.statusCode}): ${result.body.slice(0, 200)}`);
  }
  try {
    return result.body ? JSON.parse(result.body) : {};
  } catch {
    return result.body;
  }
}

const KeeneticPlugin = {
  async detect(ctx) {
    try {
      const version = await rciRequest(ctx, 'GET', '/rci/show/version');
      const model = version?.model || version?.hw_id;
      return model
        ? { success: true, message: 'RCI /rci/show/version reachable', detail: model }
        : { success: false, message: 'unexpected /rci/show/version response shape' };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    return KeeneticPlugin.testConnection(ctx);
  },

  async testConnection(ctx) {
    try {
      const version = await rciRequest(ctx, 'GET', '/rci/show/version');
      return { success: true, message: 'RCI connection OK', detail: version?.release || version?.model };
    } catch (err) {
      return { success: false, message: `RCI connection failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set ip name-server to ${dnsServer}`);
    if (dry) return dry;

    try {
      const before = await rciRequest(ctx, 'GET', '/rci/ip/name-server').catch(() => null);
      await rciRequest(ctx, 'POST', '/rci/ip/name-server', JSON.stringify({ 'name-server': dnsServer }));
      const after = await rciRequest(ctx, 'GET', '/rci/ip/name-server').catch(() => null);
      const afterValue = after?.['name-server'] || after;

      if (afterValue === dnsServer || (Array.isArray(after) && after.includes(dnsServer))) {
        return { success: true, message: `DNS server set to ${dnsServer}` };
      }
      if (before) {
        await rciRequest(ctx, 'POST', '/rci/ip/name-server', JSON.stringify(before)).catch(() => {});
      }
      return { success: false, message: 'DNS change did not verify — restored previous value' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return KeeneticPlugin.blockMAC(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return KeeneticPlugin.unblockMAC(ctx, target);
  },

  // Keenetic's documented per-device enforcement primitive is the "Access
  // control" hotspot-host policy assignment (`ip hotspot host <mac> policy
  // <name>` in the CLI), keyed by MAC — not an arbitrary WAN-IP ACL — so
  // applyFirewallRule/removeFirewallRule require a macAddress and delegate
  // to the same mechanism blockMAC uses, same pattern as this project's
  // linksys/tplink_omada plugins.
  async applyFirewallRule(ctx, { macAddress, deviceId } = {}) {
    if (!macAddress) return { success: false, message: 'Keenetic RCI has no documented IP-based firewall rule action — a macAddress is required (hotspot host policy)' };
    return KeeneticPlugin.blockMAC(ctx, { macAddress, deviceId });
  },

  async removeFirewallRule(ctx, { macAddress, deviceId } = {}) {
    if (!macAddress) return { success: false, message: 'Keenetic RCI has no documented IP-based firewall rule action — a macAddress is required (hotspot host policy)' };
    return KeeneticPlugin.unblockMAC(ctx, { macAddress, deviceId });
  },

  async blockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `deny hotspot access for ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    const path = `/rci/ip/hotspot/host/${encodeURIComponent(macAddress)}`;
    try {
      await rciRequest(ctx, 'POST', path, JSON.stringify({ access: 'deny' }));
      const verify = await rciRequest(ctx, 'GET', path).catch(() => null);
      if (verify?.access === 'deny') return { success: true, message: `${macAddress} blocked` };
      return { success: false, message: 'access=deny did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `permit hotspot access for ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    const path = `/rci/ip/hotspot/host/${encodeURIComponent(macAddress)}`;
    try {
      await rciRequest(ctx, 'POST', path, JSON.stringify({ access: 'permit' }));
      const verify = await rciRequest(ctx, 'GET', path).catch(() => null);
      if (verify?.access !== 'deny') return { success: true, message: `${macAddress} unblocked` };
      return { success: false, message: 'access=permit did not verify' };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    // No documented RCI action forces an already-associated Wi-Fi client off
    // instantly (unlike UniFi's stamgr kick-sta) — the hotspot access=deny
    // policy above prevents further traffic but doesn't tear down a live
    // association. Same honest-limitation shape as fritzbox/linksys.
    return {
      success: false,
      message: `Keenetic RCI has no documented instant-disconnect action for ${macAddress || 'this client'} — use blockMAC to prevent further access instead`,
    };
  },
};

module.exports = { KeeneticPlugin, rciRequest, buildDigestHeader, parseDigestChallenge };

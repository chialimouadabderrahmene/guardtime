'use strict';

// Ubiquiti UniFi — the widely-used legacy UniFi Network Controller API
// (`/api/s/{site}/...`), the same endpoint family used by the long-standing
// open-source UniFi integrations in Home Assistant and python-unifi (this
// project has no UniFi hardware to test against — see the honesty note in
// the module doc comment at the bottom for what that means here). Two
// controller flavors exist in the wild and use different login/base paths:
//   - "UniFi OS" consoles (UDM/UDM-Pro/Cloud Gateway, current hardware):
//     POST /api/auth/login, API under /proxy/network/api/s/{site}/...,
//     mutating requests need an X-CSRF-Token header echoed back from login.
//   - Legacy self-hosted controller software (older/software installs):
//     POST /api/login, API under /api/s/{site}/..., no CSRF token.
// login() tries UniFi OS first (the more common case on current hardware)
// and falls back to the legacy path — set ctx.unifiOs = false to skip
// straight to legacy if you know that's what you're talking to.
//
// TLS: both flavors serve HTTPS with a self-signed certificate out of the
// box. This plugin does NOT silently disable certificate verification
// (flipping NODE_TLS_REJECT_UNAUTHORIZED process-wide would weaken TLS
// verification for every other HTTPS call this agent makes, including the
// backend connection). Point ctx.ipAddress at a controller with a trusted
// certificate (the UniFi OS "manage certificate" page can issue one, e.g.
// via Let's Encrypt on a reachable hostname), or accept that detect()/login()
// will fail with a clear TLS error until one is installed.
//
// Client MAC operations (block/unblock/kick) are the native, well-supported
// mechanism for this vendor (station manager `cmd/stamgr`) — prefer
// blockMAC/unblockMAC/disconnectClient over the IP-based firewall-rule path
// where possible for a UniFi target.

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] unifi: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

function site(ctx) {
  return ctx.site || 'default';
}

function basePath(ctx, unifiOs) {
  return unifiOs ? `/proxy/network/api/s/${site(ctx)}` : `/api/s/${site(ctx)}`;
}

function originUrl(ctx) {
  const port = ctx.port ? `:${ctx.port}` : '';
  return `https://${ctx.ipAddress}${port}`;
}

function parseSetCookie(headers) {
  const raw = headers.get('set-cookie');
  if (!raw) return null;
  // Only the cookie name=value pair is needed for subsequent requests —
  // strip the Path/HttpOnly/etc attributes.
  return raw.split(';')[0];
}

/**
 * Logs in and returns a session usable for exactly this call — every
 * mutating method below calls this fresh rather than caching a session
 * across calls, matching this project's existing stateless-per-call plugin
 * contract (see openwrt/index.js's `login()` for the same pattern with a
 * different protocol).
 */
async function login(ctx) {
  const { credentials } = ctx;
  const body = JSON.stringify({ username: credentials?.username || '', password: credentials?.password || '' });
  const tryUnifiOs = ctx.unifiOs !== false;

  async function attempt(unifiOs) {
    const path = unifiOs ? '/api/auth/login' : '/api/login';
    const response = await fetch(`${originUrl(ctx)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`unifi login failed (status ${response.status})`);
    const cookie = parseSetCookie(response.headers);
    if (!cookie) throw new Error('unifi login did not return a session cookie');
    const csrfToken = response.headers.get('x-csrf-token') || response.headers.get('x-updated-csrf-token') || null;
    return { unifiOs, cookie, csrfToken };
  }

  if (tryUnifiOs) {
    try {
      return await attempt(true);
    } catch (err) {
      ctx.logger?.debug('unifi: UniFi OS login path failed, falling back to legacy controller path', { error: err.message });
    }
  }
  return attempt(false);
}

async function apiRequest(ctx, session, method, path, body) {
  const headers = { 'Content-Type': 'application/json', Cookie: session.cookie };
  if (session.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;

  const response = await fetch(`${originUrl(ctx)}${basePath(ctx, session.unifiOs)}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = (data && data.meta && data.meta.msg) || text || `HTTP ${response.status}`;
    throw new Error(`unifi ${method} ${path} failed: ${message}`);
  }
  return data;
}

async function stamgrCommand(ctx, session, cmd, macAddress) {
  return apiRequest(ctx, session, 'POST', '/cmd/stamgr', { cmd, mac: macAddress.toLowerCase() });
}

async function findClient(ctx, session, macAddress) {
  const result = await apiRequest(ctx, session, 'GET', `/stat/sta`).catch(() => ({ data: [] }));
  const clients = Array.isArray(result?.data) ? result.data : [];
  return clients.find((client) => (client.mac || '').toLowerCase() === macAddress.toLowerCase()) || null;
}

async function findFirewallRule(ctx, session, ipAddress) {
  const result = await apiRequest(ctx, session, 'GET', '/rest/firewallrule').catch(() => ({ data: [] }));
  const rules = Array.isArray(result?.data) ? result.data : [];
  return rules.find((rule) => rule.src_address === ipAddress && (rule.name || '').startsWith('guardtime:')) || null;
}

const UniFiPlugin = {
  async detect(ctx) {
    try {
      const session = await login(ctx);
      return { success: true, message: `UniFi controller reachable (${session.unifiOs ? 'UniFi OS' : 'legacy controller'})` };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    try {
      const session = await login(ctx);
      return { success: true, message: `logged in (${session.unifiOs ? 'UniFi OS' : 'legacy controller'} session)` };
    } catch (err) {
      return { success: false, message: `login failed: ${err.message}` };
    }
  },

  async testConnection(ctx) {
    try {
      const session = await login(ctx);
      await apiRequest(ctx, session, 'GET', '/self');
      return { success: true, message: 'UniFi API connection OK' };
    } catch (err) {
      return { success: false, message: `UniFi API connection failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set network DNS server to ${dnsServer}`);
    if (dry) return dry;

    try {
      const session = await login(ctx);
      const before = await apiRequest(ctx, session, 'GET', '/rest/setting/dns').catch(() => ({ data: [] }));
      const settingId = before?.data?.[0]?._id;
      if (!settingId) return { success: false, message: 'could not locate DNS setting object on this controller' };

      await apiRequest(ctx, session, 'PUT', `/rest/setting/dns/${settingId}`, { name1: dnsServer });
      const after = await apiRequest(ctx, session, 'GET', `/rest/setting/dns/${settingId}`).catch(() => null);
      if (after?.data?.[0]?.name1 === dnsServer) {
        return { success: true, message: `DNS server set to ${dnsServer}` };
      }
      return { success: false, message: 'DNS change did not verify' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return UniFiPlugin.blockMAC(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return UniFiPlugin.unblockMAC(ctx, target);
  },

  async blockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `block-sta ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const session = await login(ctx);
      await stamgrCommand(ctx, session, 'block-sta', macAddress);
      const client = await findClient(ctx, session, macAddress);
      if (!client || client.blocked === true) return { success: true, message: `${macAddress} blocked` };
      return { success: false, message: 'block-sta did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `unblock-sta ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const session = await login(ctx);
      await stamgrCommand(ctx, session, 'unblock-sta', macAddress);
      const client = await findClient(ctx, session, macAddress);
      if (!client || client.blocked !== true) return { success: true, message: `${macAddress} unblocked` };
      return { success: false, message: 'unblock-sta did not verify' };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `kick-sta ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const session = await login(ctx);
      const client = await findClient(ctx, session, macAddress);
      if (!client) return { success: false, message: `${macAddress} is not currently associated (nothing to disconnect)` };
      await stamgrCommand(ctx, session, 'kick-sta', macAddress);
      return { success: true, message: `disconnected client ${macAddress}` };
    } catch (err) {
      return { success: false, message: `disconnectClient failed: ${err.message}` };
    }
  },

  async applyFirewallRule(ctx, { ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add firewall drop rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to add a UniFi firewall rule' };

    try {
      const session = await login(ctx);
      await apiRequest(ctx, session, 'POST', '/rest/firewallrule', {
        name: `guardtime:${deviceId || ipAddress}`,
        ruleset: 'WAN_LOCAL',
        rule_index: 20000,
        action: 'drop',
        protocol_match_excepted: false,
        logging: false,
        state_new: true,
        state_established: true,
        state_invalid: true,
        state_related: true,
        ipsec: '',
        src_firewallgroup_ids: [],
        src_mac_address: '',
        src_address: ipAddress,
        dst_firewallgroup_ids: [],
        dst_address: '',
        enabled: true,
      });
      const verify = await findFirewallRule(ctx, session, ipAddress);
      if (verify) return { success: true, message: `firewall drop rule added for ${ipAddress}` };
      return { success: false, message: 'firewall rule did not verify' };
    } catch (err) {
      return { success: false, message: `applyFirewallRule failed: ${err.message}` };
    }
  },

  async removeFirewallRule(ctx, { ipAddress } = {}) {
    const dry = dryRunResult(ctx, `remove firewall drop rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to remove a UniFi firewall rule' };

    try {
      const session = await login(ctx);
      const rule = await findFirewallRule(ctx, session, ipAddress);
      if (!rule) return { success: true, message: `no firewall drop rule found for ${ipAddress} (already clear)` };
      await apiRequest(ctx, session, 'DELETE', `/rest/firewallrule/${rule._id}`);
      return { success: true, message: `firewall drop rule removed for ${ipAddress}` };
    } catch (err) {
      return { success: false, message: `removeFirewallRule failed: ${err.message}` };
    }
  },
};

module.exports = { UniFiPlugin };

// Honesty note (matches this project's existing standard — see
// vpn-patterns.js, doh-dot-patterns.js, tls-fingerprint-detector.js for the
// same posture elsewhere): this plugin was written against UniFi's
// publicly-documented and widely-referenced (Home Assistant, python-unifi)
// legacy controller API shape, but has never been run against real UniFi
// hardware in this environment — there is none available here. Endpoint
// paths and field names are believed correct as of current UniFi Network
// Application versions but are NOT independently verified the way this
// project's iptables/nftables/conntrack commands are (those match official
// Linux tool documentation directly executable in principle). Treat
// `pluginImplemented: true` for `unifi` in router-capability.matrix.ts as
// "implemented, needs a first real-hardware smoke test," not "verified."

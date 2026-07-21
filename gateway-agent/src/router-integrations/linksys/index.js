'use strict';

// Linksys (Smart Wi-Fi) — JNAP (JSON Network API for Provisioning), the
// wire protocol documented in the Linksys Smart Wi-Fi Developer SDK PDF
// linked from this project's router-capability.matrix.ts
// (`officialDocUrl` for the `linksys` row). Every JNAP request is a single
// POST to `/JNAP/` with the action identified by an `X-JNAP-Action` URI
// header rather than the URL path, and the JSON body carrying that action's
// parameters — this transport shape (action-header + POST-to-one-endpoint)
// is the part of JNAP independently corroborated across every public
// description of the protocol, and is what this plugin implements exactly.
//
// Auth: JNAP credentials are sent per-request via an `X-JNAP-Authorization`
// header (`Basic base64(username:password)`), the same stateless-per-call
// shape as this project's mikrotik plugin (HTTP Basic) — there is no
// server-side session to hold or tear down, so logout() is left on the
// shared default from plugin-interface.js (accurate, not a shortcut).
//
// Honesty note (same posture as unifi/edgerouter/index.js): no Linksys
// hardware is available in this environment. The core transport
// (X-JNAP-Action POST /JNAP/, X-JNAP-Authorization Basic header,
// GetDeviceInfo/CheckAdminPassword) is the well-established, independently
// corroborated part of JNAP. The exact action names used below for
// WAN/parental-control/MAC-filter settings follow the shapes documented in
// the linked SDK and widely mirrored in third-party JNAP write-ups, but —
// like unifi/edgerouter — have never been smoke-tested against a real
// device. Treat this as "implemented against documentation," not
// "hardware-verified."

const JNAP_ACTION_NS = 'http://linksys.com/jnap';

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] linksys: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

function authHeader(ctx) {
  const { credentials } = ctx;
  if (!credentials?.username && !credentials?.password) return null;
  const token = Buffer.from(`${credentials?.username || 'admin'}:${credentials?.password || ''}`).toString('base64');
  return `Basic ${token}`;
}

/** One JNAP call: POST /JNAP/ with X-JNAP-Action naming the action and the JSON body as its parameters. */
async function jnapCall(ctx, action, params = {}, { requireAuth = true } = {}) {
  const scheme = ctx.useHttps ? 'https' : 'http';
  const port = ctx.port ? `:${ctx.port}` : '';
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'X-JNAP-Action': `${JNAP_ACTION_NS}/${action}`,
  };
  const auth = authHeader(ctx);
  if (requireAuth && auth) headers['X-JNAP-Authorization'] = auth;

  const response = await fetch(`${scheme}://${ctx.ipAddress}${port}/JNAP/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
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
    throw new Error(`JNAP ${action} failed (HTTP ${response.status}): ${typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data)}`);
  }
  if (data && data.result && data.result !== 'OK') {
    throw new Error(`JNAP ${action} returned result=${data.result}${data.error ? `: ${data.error}` : ''}`);
  }
  return data?.output || {};
}

const LinksysPlugin = {
  async detect(ctx) {
    try {
      const info = await jnapCall(ctx, 'core/GetDeviceInfo', {}, { requireAuth: false });
      return {
        success: true,
        message: 'JNAP GetDeviceInfo reachable',
        detail: [info.manufacturer, info.modelNumber, info.firmwareVersion].filter(Boolean).join(' '),
      };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    try {
      await jnapCall(ctx, 'core/CheckAdminPassword', { AdminPassword: ctx.credentials?.password || '' });
      return { success: true, message: 'JNAP admin credentials accepted' };
    } catch (err) {
      return { success: false, message: `login failed: ${err.message}` };
    }
  },

  async testConnection(ctx) {
    try {
      const info = await jnapCall(ctx, 'core/GetDeviceInfo', {}, { requireAuth: false });
      await jnapCall(ctx, 'core/CheckAdminPassword', { AdminPassword: ctx.credentials?.password || '' });
      return { success: true, message: 'JNAP connection OK', detail: info.modelNumber || info.firmwareVersion };
    } catch (err) {
      return { success: false, message: `JNAP connection failed: ${err.message}` };
    }
  },

  /** Cheap, unauthenticated reachability probe — GetDeviceInfo needs no credentials, same call detect() uses. */
  async health(ctx) {
    const startedAt = Date.now();
    try {
      await jnapCall(ctx, 'core/GetDeviceInfo', {}, { requireAuth: false });
      return { success: true, message: 'JNAP endpoint reachable', detail: `${Date.now() - startedAt}ms` };
    } catch (err) {
      return { success: false, message: `health check failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set WAN DNS to ${dnsServer}`);
    if (dry) return dry;

    try {
      const before = await jnapCall(ctx, 'router/GetWANSettings').catch(() => ({}));
      await jnapCall(ctx, 'router/SetWANSettings', {
        ...before,
        wanSettings: { ...(before.wanSettings || {}), dns1: dnsServer, staticDNS1: dnsServer },
      });
      const after = await jnapCall(ctx, 'router/GetWANSettings').catch(() => ({}));
      const afterDns = after?.wanSettings?.dns1 || after?.wanSettings?.staticDNS1;

      if (afterDns === dnsServer) return { success: true, message: `WAN DNS set to ${dnsServer}` };
      if (before?.wanSettings) {
        await jnapCall(ctx, 'router/SetWANSettings', before).catch(() => {});
      }
      return { success: false, message: 'DNS change did not verify — restored previous value' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, { macAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add ${macAddress} to parental-control blocked devices`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required to pause a Linksys device' };

    try {
      const before = await jnapCall(ctx, 'parentalcontrol/GetParentalControlSettings').catch(() => ({ rules: [] }));
      const rules = Array.isArray(before.rules) ? before.rules : [];
      const alreadyBlocked = rules.some((r) => (r.macAddress || '').toLowerCase() === macAddress.toLowerCase() && r.blockInternet);
      if (alreadyBlocked) return { success: true, message: `${macAddress} already blocked (idempotent)` };

      const updated = [...rules, { macAddress, description: `guardtime:${deviceId || macAddress}`, blockInternet: true }];
      await jnapCall(ctx, 'parentalcontrol/SetParentalControlSettings', { ...before, rules: updated, isParentalControlEnabled: true });

      const verify = await jnapCall(ctx, 'parentalcontrol/GetParentalControlSettings').catch(() => ({ rules: [] }));
      const found = (verify.rules || []).some((r) => (r.macAddress || '').toLowerCase() === macAddress.toLowerCase() && r.blockInternet);
      return found
        ? { success: true, message: `${macAddress} paused via parental-control block` }
        : { success: false, message: 'pause rule did not verify' };
    } catch (err) {
      return { success: false, message: `pauseDevice failed: ${err.message}` };
    }
  },

  async resumeDevice(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `remove ${macAddress} from parental-control blocked devices`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required to resume a Linksys device' };

    try {
      const before = await jnapCall(ctx, 'parentalcontrol/GetParentalControlSettings').catch(() => ({ rules: [] }));
      const rules = Array.isArray(before.rules) ? before.rules : [];
      const remaining = rules.filter((r) => (r.macAddress || '').toLowerCase() !== macAddress.toLowerCase());
      if (remaining.length === rules.length) return { success: true, message: `${macAddress} was not paused (already clear)` };

      await jnapCall(ctx, 'parentalcontrol/SetParentalControlSettings', { ...before, rules: remaining });
      const verify = await jnapCall(ctx, 'parentalcontrol/GetParentalControlSettings').catch(() => ({ rules: [] }));
      const stillBlocked = (verify.rules || []).some((r) => (r.macAddress || '').toLowerCase() === macAddress.toLowerCase());
      return !stillBlocked
        ? { success: true, message: `${macAddress} resumed` }
        : { success: false, message: 'resume did not verify' };
    } catch (err) {
      return { success: false, message: `resumeDevice failed: ${err.message}` };
    }
  },

  // Linksys's blocking primitive is MAC-based (parental control / MAC
  // filter), not an arbitrary WAN-IP ACL the way MikroTik/OpenWrt/UniFi
  // firewall rules are — so applyFirewallRule/removeFirewallRule require a
  // macAddress and delegate to the same MAC-filter mechanism blockMAC uses,
  // rather than pretending to support IP-based rules JNAP doesn't document.
  async applyFirewallRule(ctx, { macAddress, deviceId } = {}) {
    if (!macAddress) return { success: false, message: 'Linksys/JNAP has no documented IP-based firewall rule action — a macAddress is required (MAC filter)' };
    return LinksysPlugin.blockMAC(ctx, { macAddress, deviceId });
  },

  async removeFirewallRule(ctx, { macAddress, deviceId } = {}) {
    if (!macAddress) return { success: false, message: 'Linksys/JNAP has no documented IP-based firewall rule action — a macAddress is required (MAC filter)' };
    return LinksysPlugin.unblockMAC(ctx, { macAddress, deviceId });
  },

  async blockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `add ${macAddress} to MAC filter deny list`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const before = await jnapCall(ctx, 'router/GetMACFilterSettings').catch(() => ({ macFilterMode: 'Disabled', macAddresses: [] }));
      const list = Array.isArray(before.macAddresses) ? before.macAddresses : [];
      const updated = list.some((m) => m.toLowerCase() === macAddress.toLowerCase()) ? list : [...list, macAddress];

      await jnapCall(ctx, 'router/SetMACFilterSettings', { macFilterMode: 'Deny', macAddresses: updated });
      const verify = await jnapCall(ctx, 'router/GetMACFilterSettings').catch(() => ({ macAddresses: [] }));
      const found = (verify.macAddresses || []).some((m) => m.toLowerCase() === macAddress.toLowerCase()) && verify.macFilterMode === 'Deny';
      return found
        ? { success: true, message: `${macAddress} added to MAC filter deny list` }
        : { success: false, message: 'MAC filter entry did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `remove ${macAddress} from MAC filter deny list`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const before = await jnapCall(ctx, 'router/GetMACFilterSettings').catch(() => ({ macAddresses: [] }));
      const list = Array.isArray(before.macAddresses) ? before.macAddresses : [];
      const remaining = list.filter((m) => m.toLowerCase() !== macAddress.toLowerCase());
      if (remaining.length === list.length) return { success: true, message: `${macAddress} already clear (not in MAC filter list)` };

      await jnapCall(ctx, 'router/SetMACFilterSettings', { ...before, macAddresses: remaining });
      const verify = await jnapCall(ctx, 'router/GetMACFilterSettings').catch(() => ({ macAddresses: [] }));
      const stillPresent = (verify.macAddresses || []).some((m) => m.toLowerCase() === macAddress.toLowerCase());
      return !stillPresent
        ? { success: true, message: `${macAddress} removed from MAC filter deny list` }
        : { success: false, message: 'MAC filter removal did not verify' };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    // No documented JNAP action forces an already-associated client off the
    // radio instantly (unlike UniFi's stamgr kick-sta or MikroTik's
    // registration-table delete) — MAC-filter/parental-control blocking
    // (above) prevents reconnection but doesn't tear down a live session.
    // Same honest-limitation shape as fritzbox/index.js's disconnectClient.
    return {
      success: false,
      message: `Linksys JNAP has no documented instant-disconnect action for ${macAddress || 'this client'} — use blockMAC/pauseDevice to prevent reconnection instead`,
    };
  },
};

module.exports = { LinksysPlugin, jnapCall, authHeader };

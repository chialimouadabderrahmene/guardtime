'use strict';

// TP-Link Omada (SDN Controller-managed access points/routers) — the Omada
// Open API (a.k.a. "Northbound API"), documented at the URL this project's
// router-capability.matrix.ts cites for `tplink_omada`
// (https://use1-omada-northbound.tplinkcloud.com/doc.html): OAuth2
// client-credentials auth against `/openapi/authorize/token`, then
// site/device/client resources under `/openapi/v1/{omadacId}/...`.
// `ctx.omadacId` (the controller's own ID, visible in its "About" page /
// returned by the token-exchange response) selects which controller
// instance to talk to — required, since one Omada Open API app registration
// can be scoped to more than one controller.
//
// Honesty note (same posture as unifi/edgerouter/index.js): no Omada
// hardware/controller is available in this environment. The OAuth2
// client-credentials token exchange and the sites/devices/clients resource
// shape are the well-documented part of the Open API. The per-client
// block/unblock/reconnect action paths below follow the shape Omada's own
// Open API documentation describes for client management, but have never
// been smoke-tested against a real controller. The Open API's public scope
// does NOT document a WAN-DNS-change or generic IP-firewall-ACL endpoint
// (unlike its device/client monitoring and per-client block/unblock/
// reconnect actions) — changeDNS honestly reports that rather than
// inventing an endpoint TP-Link has not published.

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] tplink_omada: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

function baseUrl(ctx) {
  const scheme = ctx.useHttp ? 'http' : 'https';
  const port = ctx.port ? `:${ctx.port}` : '';
  return `${scheme}://${ctx.ipAddress}${port}`;
}

/** OAuth2 client-credentials grant — fetched fresh per call, same stateless-per-call convention as openwrt/unifi. */
async function getAccessToken(ctx) {
  const { credentials } = ctx;
  const url = `${baseUrl(ctx)}/openapi/authorize/token?grant_type=client_credential&client_id=${encodeURIComponent(credentials?.clientId || '')}&client_secret=${encodeURIComponent(credentials?.clientSecret || '')}`;
  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(8000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.errorCode !== 0 || !payload.result?.accessToken) {
    throw new Error(`Omada token exchange failed: ${payload?.msg || `HTTP ${response.status}`}`);
  }
  return payload.result.accessToken;
}

async function omadaRequest(ctx, method, path, body) {
  const token = await getAccessToken(ctx);
  const response = await fetch(`${baseUrl(ctx)}/openapi/v1${path}`, {
    method,
    headers: { Authorization: `AccessToken=${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.errorCode !== 0) {
    throw new Error(`Omada ${method} ${path} failed: ${payload?.msg || `HTTP ${response.status}`}`);
  }
  return payload.result;
}

function omadacId(ctx) {
  if (!ctx.omadacId) throw new Error('ctx.omadacId is required (the Omada controller ID) — see this plugin\'s module doc comment');
  return ctx.omadacId;
}

async function resolveSiteId(ctx) {
  if (ctx.siteId) return ctx.siteId;
  const sites = await omadaRequest(ctx, 'GET', `/${omadacId(ctx)}/sites?page=1&pageSize=1`);
  const siteId = sites?.data?.[0]?.siteId;
  if (!siteId) throw new Error('no Omada site found for this controller — pass ctx.siteId explicitly');
  return siteId;
}

async function findClient(ctx, siteId, macAddress) {
  const clients = await omadaRequest(ctx, 'GET', `/${omadacId(ctx)}/sites/${siteId}/clients?currentPage=1&currentPageSize=100`);
  const list = Array.isArray(clients?.data) ? clients.data : [];
  return list.find((c) => (c.mac || '').toLowerCase() === macAddress.toLowerCase()) || null;
}

const TplinkOmadaPlugin = {
  async detect(ctx) {
    try {
      const token = await getAccessToken(ctx);
      return { success: !!token, message: token ? 'Omada Open API token exchange succeeded' : 'no token returned' };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    return TplinkOmadaPlugin.testConnection(ctx);
  },

  async testConnection(ctx) {
    try {
      const siteId = await resolveSiteId(ctx);
      return { success: true, message: 'Omada Open API connection OK', detail: `site ${siteId}` };
    } catch (err) {
      return { success: false, message: `Omada Open API connection failed: ${err.message}` };
    }
  },

  /** Cheap reachability probe — just the OAuth2 token exchange, no site/client resolution. */
  async health(ctx) {
    const startedAt = Date.now();
    try {
      await getAccessToken(ctx);
      return { success: true, message: 'Omada Open API endpoint reachable', detail: `${Date.now() - startedAt}ms` };
    } catch (err) {
      return { success: false, message: `health check failed: ${err.message}` };
    }
  },

  async changeDNS() {
    // The publicly documented Omada Open API scope covers site/device/client
    // monitoring plus per-client block/unblock/reconnect — it does not
    // publish a WAN-DNS-change endpoint (that is a controller-UI-only
    // setting as of the cited API doc). Reporting this honestly rather than
    // inventing an undocumented endpoint.
    return {
      success: false,
      message: 'Omada Open API has no documented WAN DNS-change endpoint — configure DNS from the Omada Controller UI directly',
    };
  },

  async pauseDevice(ctx, target) {
    return TplinkOmadaPlugin.blockMAC(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return TplinkOmadaPlugin.unblockMAC(ctx, target);
  },

  // Omada's documented enforcement primitive is per-client MAC block, not an
  // arbitrary WAN-IP ACL — applyFirewallRule/removeFirewallRule require a
  // macAddress and delegate to the same mechanism blockMAC uses, same
  // pattern as this project's linksys plugin.
  async applyFirewallRule(ctx, { macAddress, deviceId } = {}) {
    if (!macAddress) return { success: false, message: 'Omada Open API has no documented IP-based firewall rule action — a macAddress is required (client block)' };
    return TplinkOmadaPlugin.blockMAC(ctx, { macAddress, deviceId });
  },

  async removeFirewallRule(ctx, { macAddress, deviceId } = {}) {
    if (!macAddress) return { success: false, message: 'Omada Open API has no documented IP-based firewall rule action — a macAddress is required (client unblock)' };
    return TplinkOmadaPlugin.unblockMAC(ctx, { macAddress, deviceId });
  },

  async blockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `block client ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const siteId = await resolveSiteId(ctx);
      await omadaRequest(ctx, 'POST', `/${omadacId(ctx)}/sites/${siteId}/clients/${encodeURIComponent(macAddress)}/block`);
      const client = await findClient(ctx, siteId, macAddress);
      if (!client || client.blocked === true) return { success: true, message: `${macAddress} blocked` };
      return { success: false, message: 'block action did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `unblock client ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const siteId = await resolveSiteId(ctx);
      await omadaRequest(ctx, 'POST', `/${omadacId(ctx)}/sites/${siteId}/clients/${encodeURIComponent(macAddress)}/unblock`);
      const client = await findClient(ctx, siteId, macAddress);
      if (!client || client.blocked !== true) return { success: true, message: `${macAddress} unblocked` };
      return { success: false, message: 'unblock action did not verify' };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `reconnect (kick) client ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const siteId = await resolveSiteId(ctx);
      const client = await findClient(ctx, siteId, macAddress);
      if (!client) return { success: false, message: `${macAddress} is not currently associated (nothing to disconnect)` };
      await omadaRequest(ctx, 'POST', `/${omadacId(ctx)}/sites/${siteId}/clients/${encodeURIComponent(macAddress)}/reconnect`);
      return { success: true, message: `disconnected client ${macAddress}` };
    } catch (err) {
      return { success: false, message: `disconnectClient failed: ${err.message}` };
    }
  },
};

module.exports = { TplinkOmadaPlugin, getAccessToken, omadaRequest, resolveSiteId };

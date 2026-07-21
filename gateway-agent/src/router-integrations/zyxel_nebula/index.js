'use strict';

// Zyxel Nebula (cloud-managed gateways/APs/switches) — the Nebula Open API,
// documented at https://zyxelnetworks.github.io/NebulaOpenAPI/ (the
// `officialDocUrl` this project's router-capability.matrix.ts cites for
// `zyxel_nebula`). Unlike every other plugin in this directory, Nebula is a
// CLOUD API (`https://api.nebula.zyxel.com` or a region-specific host) with
// a single Bearer API-key header — there is no LAN-local endpoint to reach,
// so `ctx.ipAddress` is not used here; `ctx.credentials.apiKey` and
// `ctx.orgId`/`ctx.siteId` are what select the actual Nebula organization
// and site to operate against.
//
// Honesty note: the Nebula Open API's publicly documented scope (as of the
// cited docs) is organization/site/device/client MONITORING — listing
// organizations, sites, devices, and connected clients, and reading their
// status. It does not publish a client-block, DNS-change, or firewall-rule
// write endpoint the way Omada's Open API documents block/unblock/reconnect
// client actions. Rather than inventing an endpoint Zyxel has not
// published (this project's explicit, repeated rule — see
// router-capability.matrix.ts's own doc comment), every mutating method
// below honestly reports that the public API has no documented action for
// it. detect/login/testConnection/health are real, working calls against
// the real, documented read API — this plugin is genuinely useful for
// identifying a Nebula-managed site and confirming API-key validity, it
// just cannot enforce through the public API surface as currently
// documented.

function baseUrl(ctx) {
  return ctx.apiBaseUrl || 'https://api.nebula.zyxel.com';
}

async function nebulaRequest(ctx, path) {
  const apiKey = ctx.credentials?.apiKey;
  if (!apiKey) throw new Error('ctx.credentials.apiKey is required for the Nebula Open API');

  const response = await fetch(`${baseUrl(ctx)}/api/v1${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
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
    const message = (data && (data.message || data.msg)) || text || `HTTP ${response.status}`;
    throw new Error(`Nebula GET ${path} failed: ${message}`);
  }
  return data;
}

function orgId(ctx) {
  if (!ctx.orgId) throw new Error('ctx.orgId is required (the Nebula organization ID) — see this plugin\'s module doc comment');
  return ctx.orgId;
}

function unsupported(action) {
  return {
    success: false,
    guideOnly: true,
    message: `The public Nebula Open API has no documented ${action} endpoint (its published scope is organization/site/device/client monitoring, not write actions) — perform this from the Nebula portal directly.`,
  };
}

const ZyxelNebulaPlugin = {
  async detect(ctx) {
    try {
      const orgs = await nebulaRequest(ctx, '/organizations');
      const list = Array.isArray(orgs?.data) ? orgs.data : Array.isArray(orgs) ? orgs : [];
      return { success: true, message: 'Nebula Open API reachable', detail: `${list.length} organization(s) visible to this API key` };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    return ZyxelNebulaPlugin.testConnection(ctx);
  },

  async testConnection(ctx) {
    try {
      const sites = await nebulaRequest(ctx, `/organizations/${orgId(ctx)}/sites`);
      const list = Array.isArray(sites?.data) ? sites.data : Array.isArray(sites) ? sites : [];
      return { success: true, message: 'Nebula Open API connection OK', detail: `${list.length} site(s) in organization ${orgId(ctx)}` };
    } catch (err) {
      return { success: false, message: `Nebula Open API connection failed: ${err.message}` };
    }
  },

  /** Cheap reachability probe — same organizations listing detect() uses. */
  async health(ctx) {
    const startedAt = Date.now();
    try {
      await nebulaRequest(ctx, '/organizations');
      return { success: true, message: 'Nebula Open API endpoint reachable', detail: `${Date.now() - startedAt}ms` };
    } catch (err) {
      return { success: false, message: `health check failed: ${err.message}` };
    }
  },

  async changeDNS() {
    return unsupported('WAN DNS-change');
  },

  async pauseDevice() {
    return unsupported('client-pause');
  },

  async resumeDevice() {
    return unsupported('client-resume');
  },

  async applyFirewallRule() {
    return unsupported('firewall-rule-write');
  },

  async removeFirewallRule() {
    return unsupported('firewall-rule-write');
  },

  async blockMAC() {
    return unsupported('client-block');
  },

  async unblockMAC() {
    return unsupported('client-unblock');
  },

  async disconnectClient() {
    return unsupported('client-disconnect');
  },
};

module.exports = { ZyxelNebulaPlugin, nebulaRequest, orgId };

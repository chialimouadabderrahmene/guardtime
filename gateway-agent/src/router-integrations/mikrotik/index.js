'use strict';

// MikroTik — RouterOS REST API, officially documented at
// https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST+API
// (JSON over HTTP, HTTP Basic Auth). Uses Node's built-in `fetch`, already
// the convention elsewhere in this project (see backend-client.js).
//
// Endpoints used, all from the official REST API docs:
//   GET    /rest/system/resource                 — identity/testConnection
//   GET/PATCH /rest/ip/dns                        — DNS servers
//   GET/PUT/DELETE /rest/ip/firewall/filter       — IP-based block rule
//   GET/PUT/DELETE /rest/interface/wireless/access-list       — MAC ACL
//   GET/DELETE /rest/interface/wireless/registration-table    — kick a wifi client
//
// MikroTik's own docs warn that the plain `www` (HTTP) service is
// eavesdroppable and recommend `www-ssl`; this plugin defaults to plain
// HTTP because that is what ships enabled out of the box on most RouterOS
// installs, exactly the same trade-off this project already documents for
// its own gateway-agent<->backend traffic pattern. Set ctx.useHttps/ctx.port
// to opt into HTTPS once a certificate is configured on the device.

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] mikrotik: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

function baseUrl(ctx) {
  const scheme = ctx.useHttps ? 'https' : 'http';
  const port = ctx.port ? `:${ctx.port}` : '';
  return `${scheme}://${ctx.ipAddress}${port}/rest`;
}

async function restRequest(ctx, method, path, body) {
  const { credentials } = ctx;
  const auth = Buffer.from(`${credentials?.username || ''}:${credentials?.password || ''}`).toString('base64');

  const response = await fetch(`${baseUrl(ctx)}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
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
    // RouterOS error bodies are {error, message, detail} — detail carries the
    // specific reason (e.g. "invalid value for X"), message is the generic
    // HTTP-status-style summary (e.g. "Bad Request"); prefer detail.
    const message = (data && (data.detail || data.message)) || text || `HTTP ${response.status}`;
    throw new Error(`RouterOS REST ${method} ${path} failed: ${message}`);
  }
  return data;
}

async function findFirewallRule(ctx, matchValue) {
  const rules = await restRequest(ctx, 'GET', '/ip/firewall/filter');
  return (Array.isArray(rules) ? rules : []).find(
    (rule) => rule['src-address'] === matchValue && (rule.comment || '').startsWith('guardtime:'),
  );
}

async function findAccessListEntry(ctx, macAddress) {
  const entries = await restRequest(ctx, 'GET', '/interface/wireless/access-list');
  return (Array.isArray(entries) ? entries : []).find((entry) => entry['mac-address'] === macAddress);
}

async function findRegistrationTableEntry(ctx, macAddress) {
  const entries = await restRequest(ctx, 'GET', '/interface/wireless/registration-table');
  return (Array.isArray(entries) ? entries : []).find((entry) => entry['mac-address'] === macAddress);
}

const MikroTikPlugin = {
  async detect(ctx) {
    try {
      const info = await restRequest(ctx, 'GET', '/system/resource');
      return { success: true, message: 'RouterOS identity confirmed', detail: info?.version };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    return MikroTikPlugin.testConnection(ctx);
  },

  async testConnection(ctx) {
    try {
      const info = await restRequest(ctx, 'GET', '/system/resource');
      return {
        success: true,
        message: 'RouterOS REST connection OK',
        detail: [info?.['board-name'], info?.version].filter(Boolean).join(' '),
      };
    } catch (err) {
      return { success: false, message: `RouterOS REST connection failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set DNS server to ${dnsServer}`);
    if (dry) return dry;

    try {
      const before = await restRequest(ctx, 'GET', '/ip/dns').catch(() => ({}));
      await restRequest(ctx, 'PATCH', '/ip/dns', { servers: dnsServer });
      const after = await restRequest(ctx, 'GET', '/ip/dns').catch(() => ({}));

      if (after?.servers && after.servers.includes(dnsServer)) {
        return { success: true, message: `DNS server set to ${dnsServer}` };
      }
      if (before?.servers) {
        await restRequest(ctx, 'PATCH', '/ip/dns', { servers: before.servers }).catch(() => {});
      }
      return { success: false, message: 'DNS change did not verify — restored previous value' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return MikroTikPlugin.applyFirewallRule(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return MikroTikPlugin.removeFirewallRule(ctx, target);
  },

  async applyFirewallRule(ctx, { ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add firewall drop rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to add a RouterOS firewall rule' };

    try {
      const created = await restRequest(ctx, 'PUT', '/ip/firewall/filter', {
        chain: 'forward',
        'src-address': ipAddress,
        action: 'drop',
        comment: `guardtime:${deviceId || ipAddress}`,
      });
      const verify = await findFirewallRule(ctx, ipAddress);
      if (verify) return { success: true, message: `firewall drop rule added for ${ipAddress}` };
      // Verification failed — clean up the just-created rule if we know its id.
      if (created?.['.id']) {
        await restRequest(ctx, 'DELETE', `/ip/firewall/filter/${created['.id']}`).catch(() => {});
        return { success: false, message: 'firewall rule did not verify — rolled back' };
      }
      return { success: false, message: 'firewall rule did not verify and could not be auto-removed (no rule id) — check router manually' };
    } catch (err) {
      return { success: false, message: `applyFirewallRule failed: ${err.message}` };
    }
  },

  async removeFirewallRule(ctx, { ipAddress } = {}) {
    const dry = dryRunResult(ctx, `remove firewall drop rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to remove a RouterOS firewall rule' };

    try {
      const rule = await findFirewallRule(ctx, ipAddress);
      if (!rule) return { success: true, message: `no firewall drop rule found for ${ipAddress} (already clear)` };
      await restRequest(ctx, 'DELETE', `/ip/firewall/filter/${rule['.id']}`);
      return { success: true, message: `firewall drop rule removed for ${ipAddress}` };
    } catch (err) {
      return { success: false, message: `removeFirewallRule failed: ${err.message}` };
    }
  },

  async blockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `add wireless access-list reject for ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      await restRequest(ctx, 'PUT', '/interface/wireless/access-list', {
        'mac-address': macAddress,
        action: 'reject',
      });
      const verify = await findAccessListEntry(ctx, macAddress);
      if (verify && verify.action === 'reject') return { success: true, message: `MAC ${macAddress} added to reject access-list` };
      return { success: false, message: 'access-list entry did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `remove wireless access-list entry for ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const entry = await findAccessListEntry(ctx, macAddress);
      if (!entry) return { success: true, message: `no access-list entry found for ${macAddress} (already clear)` };
      await restRequest(ctx, 'DELETE', `/interface/wireless/access-list/${entry['.id']}`);
      return { success: true, message: `MAC ${macAddress} removed from access-list` };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `kick wireless client ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const entry = await findRegistrationTableEntry(ctx, macAddress);
      if (!entry) return { success: false, message: `${macAddress} is not currently associated (nothing to disconnect)` };
      await restRequest(ctx, 'DELETE', `/interface/wireless/registration-table/${entry['.id']}`);
      return { success: true, message: `disconnected wireless client ${macAddress}` };
    } catch (err) {
      return { success: false, message: `disconnectClient failed: ${err.message}` };
    }
  },
};

module.exports = { MikroTikPlugin, restRequest, baseUrl };

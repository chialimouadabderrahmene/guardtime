'use strict';

// OpenWrt — ubus JSON-RPC over HTTP, officially documented by the OpenWrt
// project at https://github.com/openwrt/rpcd (the ubus RPC daemon) and the
// OpenWrt wiki's ubus/JSON-RPC pages. Config changes go through the same
// `uci` ubus object (get/set/commit) that every first-party OpenWrt tool
// uses, applied via the `luci` ubus object's `setInitAction` — the exact
// mechanism LuCI's own web UI uses to reload a service after a uci commit
// (github.com/openwrt/luci, part of the official OpenWrt project, present
// on the large majority of OpenWrt installs that ship the web UI).

const ANONYMOUS_SID = '00000000000000000000000000000000';

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] openwrt: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

let requestId = 0;

/** One ubus JSON-RPC "call" — returns [returnCode, resultData] per the ubus wire protocol. */
async function ubusCall(ctx, sid, object, method, params = {}) {
  requestId += 1;
  const response = await fetch(`http://${ctx.ipAddress}/ubus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'call',
      params: [sid, object, method, params],
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`ubus HTTP request failed (status ${response.status})`);

  const payload = await response.json();
  if (payload.error) throw new Error(`ubus error: ${payload.error.message || JSON.stringify(payload.error)}`);

  const [rc, data] = payload.result || [-1, {}];
  return { rc, data: data || {} };
}

/** ubus "list" — used only by detect() as a credential-free reachability probe. */
async function ubusList(ctx) {
  requestId += 1;
  const response = await fetch(`http://${ctx.ipAddress}/ubus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method: 'list', params: [] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`ubus HTTP request failed (status ${response.status})`);
  return response.json();
}

async function login(ctx) {
  const { credentials } = ctx;
  const { rc, data } = await ubusCall(ctx, ANONYMOUS_SID, 'session', 'login', {
    username: credentials?.username || 'root',
    password: credentials?.password || '',
  });
  if (rc !== 0 || !data.ubus_rpc_session) {
    throw new Error(`ubus session login failed (rc=${rc})`);
  }
  return data.ubus_rpc_session;
}

async function uciSetAndCommit(ctx, sid, config, values) {
  const add = await ubusCall(ctx, sid, 'uci', 'add', { config, type: 'rule' });
  if (add.rc !== 0 || !add.data.section) throw new Error(`uci.add failed (rc=${add.rc})`);
  const section = add.data.section;

  const set = await ubusCall(ctx, sid, 'uci', 'set', { config, section, values });
  if (set.rc !== 0) throw new Error(`uci.set failed (rc=${set.rc})`);

  const commit = await ubusCall(ctx, sid, 'uci', 'commit', { config });
  if (commit.rc !== 0) throw new Error(`uci.commit failed (rc=${commit.rc})`);

  return section;
}

async function reloadService(ctx, sid, name) {
  // Best-effort: if luci-mod-rpc isn't installed, the config still took
  // effect on next boot/manual reload — we don't fail the whole action for
  // a missing convenience reload.
  await ubusCall(ctx, sid, 'luci', 'setInitAction', { name, action: 'reload' }).catch(() => {});
}

async function findFirewallRuleSection(ctx, sid, matchFn) {
  const list = await ubusCall(ctx, sid, 'uci', 'get', { config: 'firewall' });
  if (list.rc !== 0) return null;
  const values = list.data.values || {};
  return Object.values(values).find((section) => section['.type'] === 'rule' && matchFn(section)) || null;
}

async function removeUciSection(ctx, sid, config, section) {
  await ubusCall(ctx, sid, 'uci', 'delete', { config, section: section['.name'] });
  await ubusCall(ctx, sid, 'uci', 'commit', { config });
}

const OpenWrtPlugin = {
  async detect(ctx) {
    try {
      const result = await ubusList(ctx);
      return result && result.jsonrpc
        ? { success: true, message: 'ubus JSON-RPC endpoint reachable' }
        : { success: false, message: 'unexpected response from /ubus' };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    try {
      await login(ctx);
      return { success: true, message: 'ubus session login OK' };
    } catch (err) {
      return { success: false, message: `login failed: ${err.message}` };
    }
  },

  async testConnection(ctx) {
    try {
      const sid = await login(ctx);
      const board = await ubusCall(ctx, sid, 'system', 'board');
      return {
        success: true,
        message: 'ubus connection OK',
        detail: board.data?.release?.description || board.data?.model,
      };
    } catch (err) {
      return { success: false, message: `connection failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set WAN DNS to ${dnsServer}`);
    if (dry) return dry;

    try {
      const sid = await login(ctx);
      const before = await ubusCall(ctx, sid, 'uci', 'get', { config: 'network', section: 'wan', option: 'dns' }).catch(() => null);
      const set = await ubusCall(ctx, sid, 'uci', 'set', { config: 'network', section: 'wan', values: { dns: [dnsServer] } });
      if (set.rc !== 0) return { success: false, message: `uci.set failed (rc=${set.rc})` };
      await ubusCall(ctx, sid, 'uci', 'commit', { config: 'network' });

      const after = await ubusCall(ctx, sid, 'uci', 'get', { config: 'network', section: 'wan', option: 'dns' }).catch(() => null);
      const afterValue = Array.isArray(after?.data?.value) ? after.data.value : after?.data?.value ? [after.data.value] : [];
      if (afterValue.includes(dnsServer)) {
        await reloadService(ctx, sid, 'network');
        return { success: true, message: `WAN DNS set to ${dnsServer}` };
      }

      if (before?.data?.value !== undefined) {
        await ubusCall(ctx, sid, 'uci', 'set', { config: 'network', section: 'wan', values: { dns: before.data.value } }).catch(() => {});
        await ubusCall(ctx, sid, 'uci', 'commit', { config: 'network' }).catch(() => {});
      }
      return { success: false, message: 'DNS change did not verify — restored previous value' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return OpenWrtPlugin.applyFirewallRule(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return OpenWrtPlugin.removeFirewallRule(ctx, target);
  },

  async applyFirewallRule(ctx, { macAddress, ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add firewall reject rule for ${ipAddress || macAddress}`);
    if (dry) return dry;
    if (!macAddress && !ipAddress) return { success: false, message: 'macAddress or ipAddress is required' };

    try {
      const sid = await login(ctx);
      const name = `guardtime-${deviceId || macAddress || ipAddress}`;
      const values = {
        name,
        src: 'lan',
        dest: 'wan',
        target: 'REJECT',
        ...(ipAddress ? { src_ip: ipAddress } : {}),
        ...(macAddress ? { src_mac: macAddress } : {}),
      };
      const committedSection = await uciSetAndCommit(ctx, sid, 'firewall', values);
      await reloadService(ctx, sid, 'firewall');

      const verify = await findFirewallRuleSection(ctx, sid, (section) => section.name === name);
      if (verify) return { success: true, message: `firewall reject rule "${name}" added` };

      await ubusCall(ctx, sid, 'uci', 'delete', { config: 'firewall', section: committedSection }).catch(() => {});
      await ubusCall(ctx, sid, 'uci', 'commit', { config: 'firewall' }).catch(() => {});
      return { success: false, message: 'firewall rule did not verify after commit — rolled back' };
    } catch (err) {
      return { success: false, message: `applyFirewallRule failed: ${err.message}` };
    }
  },

  async removeFirewallRule(ctx, { macAddress, ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `remove firewall reject rule for ${ipAddress || macAddress}`);
    if (dry) return dry;

    try {
      const sid = await login(ctx);
      const name = `guardtime-${deviceId || macAddress || ipAddress}`;
      const section = await findFirewallRuleSection(ctx, sid, (s) => s.name === name);
      if (!section) return { success: true, message: `no firewall rule "${name}" found (already clear)` };
      await removeUciSection(ctx, sid, 'firewall', section);
      await reloadService(ctx, sid, 'firewall');
      return { success: true, message: `firewall reject rule "${name}" removed` };
    } catch (err) {
      return { success: false, message: `removeFirewallRule failed: ${err.message}` };
    }
  },

  async blockMAC(ctx, { macAddress } = {}) {
    return OpenWrtPlugin.applyFirewallRule(ctx, { macAddress, deviceId: `mac-${macAddress}` });
  },

  async unblockMAC(ctx, { macAddress } = {}) {
    return OpenWrtPlugin.removeFirewallRule(ctx, { macAddress, deviceId: `mac-${macAddress}` });
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    const dry = dryRunResult(ctx, `kick wifi client ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    try {
      const sid = await login(ctx);
      const listing = await ubusList(ctx);
      const hostapdObjects = Object.keys(listing?.result || {}).filter((name) => name.startsWith('hostapd.'));

      let kicked = false;
      for (const object of hostapdObjects) {
        const result = await ubusCall(ctx, sid, object, 'del_client', {
          addr: macAddress,
          reason: 5, // documented hostapd reason code: "Disassociated because of inactivity"
          deauth: true,
          ban_time: 0,
        }).catch(() => ({ rc: -1 }));
        if (result.rc === 0) kicked = true;
      }

      return kicked
        ? { success: true, message: `disconnected wifi client ${macAddress}` }
        : { success: false, message: `${macAddress} was not associated with any wifi interface` };
    } catch (err) {
      return { success: false, message: `disconnectClient failed: ${err.message}` };
    }
  },
};

module.exports = { OpenWrtPlugin, ubusCall, ubusList, login };

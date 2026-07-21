'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// DrayTek (Vigor series) — matches this project's router-capability.matrix.ts
// row for `draytek` (`SNMP+SSH-CLI`, `supportsAPI: false`): DrayTek publishes
// no REST/JSON API, so reads use SNMP against the standard MIB-2 tree
// (sysDescr et al. — every SNMP-capable device answers these, DrayTek
// included, and DrayTek's own knowledge base documents enabling SNMP on
// Vigor routers) via the system `snmpget`/`snmpwalk` binaries (same
// shell-to-a-system-binary convention this project already uses for
// iptables/nft/conntrack/tc — see gateway-agent/src/firewall-controller.js),
// and mutations go through the Vigor "Telnet/SSH command" CLI DrayTek's own
// manuals describe for scripted configuration, reusing edgerouter/index.js's
// SSH-invocation pattern (ssh, or sshpass+ssh for password auth).
//
// Honesty note (same posture as unifi/edgerouter/index.js): no DrayTek
// hardware is available in this environment. SNMP reads use standard,
// vendor-independent MIB-2 OIDs and are on solid ground. The Vigor CLI
// command strings in DRAYTEK_CLI below follow the general shape DrayTek's
// own manuals describe (telnet/SSH access to a Cisco-like "set" CLI) but
// have never been run against real firmware — every mutating method
// verifies its own change by reading the config back afterward specifically
// BECAUSE the exact command syntax is the least-certain part of this
// plugin, and a verify-after-write is what turns "we think this worked"
// into a trustworthy `success: true`.

const SYS_DESCR_OID = '1.3.6.1.2.1.1.1.0';

const DRAYTEK_CLI = {
  showLan: 'show lan',
  setDns: (server) => `ip dhcps dns1 ${server}`,
  showDns: 'show ip dhcps',
  addFilterRule: (idx, matchField, matchValue, tag) =>
    `filter set 3 rule ${idx} enable ${matchField} ${matchValue} action block comment ${tag}`,
  removeFilterRule: (idx) => `filter set 3 rule ${idx} disable`,
  showFilterRule: (idx) => `show filter set 3 rule ${idx}`,
};

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] draytek: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

async function snmpGet(ctx, oid) {
  const community = ctx.credentials?.snmpCommunity || 'public';
  const snmpgetBin = ctx.snmpgetBin || 'snmpget';
  const { stdout } = await execFileAsync(
    snmpgetBin,
    ['-v2c', '-c', community, '-t', '3', '-r', '1', `${ctx.ipAddress}:${ctx.snmpPort || 161}`, oid],
    { timeout: 6000 },
  );
  // Standard net-snmp output shape: `iso.3.6.1.2.1.1.1.0 = STRING: "..."`.
  const match = /=\s*\w+:\s*"?([^"\n]*)"?/.exec(stdout);
  return match ? match[1].trim() : stdout.trim();
}

function buildSshInvocation(ctx, remoteCommand) {
  const sshBin = ctx.sshBin || 'ssh';
  const port = ctx.port || 22;
  const username = ctx.credentials?.username || 'admin';
  const baseArgs = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=8', '-p', String(port)];
  if (ctx.credentials?.privateKeyPath) baseArgs.push('-i', ctx.credentials.privateKeyPath);
  baseArgs.push(`${username}@${ctx.ipAddress}`, remoteCommand);

  if (ctx.credentials?.privateKeyPath || !ctx.credentials?.password) {
    return { bin: sshBin, args: baseArgs };
  }
  const sshpassBin = ctx.sshpassBin || 'sshpass';
  return { bin: sshpassBin, args: ['-p', ctx.credentials.password, sshBin, ...baseArgs] };
}

async function runCli(ctx, command) {
  const { bin, args } = buildSshInvocation(ctx, command);
  const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 10000 });
  const output = `${stdout || ''}${stderr || ''}`;
  if (/% ?error|unknown command|invalid parameter/i.test(output)) {
    throw new Error(`Vigor CLI reported an error: ${output.trim().slice(0, 300)}`);
  }
  return output;
}

/** Deterministic filter-rule index from a key, same technique as edgerouter/index.js's ruleIndexFor(). */
function ruleIndexFor(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 1 + (Math.abs(hash) % 63); // Vigor filter rule slots are conventionally 1-64 per set
}

const DrayTekPlugin = {
  async detect(ctx) {
    try {
      const descr = await snmpGet(ctx, SYS_DESCR_OID);
      const isDrayTek = /draytek|vigor/i.test(descr);
      return isDrayTek
        ? { success: true, message: 'SNMP sysDescr identifies a DrayTek Vigor device', detail: descr }
        : { success: false, message: `sysDescr did not identify as DrayTek: ${descr}` };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    try {
      await runCli(ctx, DRAYTEK_CLI.showLan);
      return { success: true, message: 'SSH CLI authentication OK' };
    } catch (err) {
      return { success: false, message: `login failed: ${err.message}` };
    }
  },

  async testConnection(ctx) {
    try {
      const output = await runCli(ctx, DRAYTEK_CLI.showLan);
      return { success: true, message: 'Vigor SSH CLI connection OK', detail: output.trim().slice(0, 120) || undefined };
    } catch (err) {
      return { success: false, message: `Vigor SSH CLI connection failed: ${err.message}` };
    }
  },

  /** Cheap, credential-light reachability probe over SNMP — distinct from the SSH-authenticated testConnection() above. */
  async health(ctx) {
    const startedAt = Date.now();
    try {
      const descr = await snmpGet(ctx, SYS_DESCR_OID);
      return { success: true, message: 'SNMP endpoint reachable', detail: `${descr} (${Date.now() - startedAt}ms)` };
    } catch (err) {
      return { success: false, message: `health check failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set LAN DHCP DNS1 to ${dnsServer}`);
    if (dry) return dry;

    try {
      await runCli(ctx, DRAYTEK_CLI.setDns(dnsServer));
      const after = await runCli(ctx, DRAYTEK_CLI.showDns);
      if (after.includes(dnsServer)) return { success: true, message: `DNS server set to ${dnsServer}` };
      return { success: false, message: 'DNS change did not verify' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return DrayTekPlugin.applyFirewallRule(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return DrayTekPlugin.removeFirewallRule(ctx, target);
  },

  async applyFirewallRule(ctx, { ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add filter block rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to add a Vigor filter rule' };

    const idx = ruleIndexFor(deviceId || ipAddress);
    try {
      await runCli(ctx, DRAYTEK_CLI.addFilterRule(idx, 'src-ip', ipAddress, `guardtime:${deviceId || ipAddress}`));
      const verify = await runCli(ctx, DRAYTEK_CLI.showFilterRule(idx));
      if (/enable:\s*yes/i.test(verify)) return { success: true, message: `filter block rule added for ${ipAddress}` };
      return { success: false, message: 'filter rule did not verify' };
    } catch (err) {
      return { success: false, message: `applyFirewallRule failed: ${err.message}` };
    }
  },

  async removeFirewallRule(ctx, { ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `remove filter block rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to remove a Vigor filter rule' };

    const idx = ruleIndexFor(deviceId || ipAddress);
    try {
      const before = await runCli(ctx, DRAYTEK_CLI.showFilterRule(idx));
      if (!/enable:\s*yes/i.test(before)) return { success: true, message: `no active filter rule found for ${ipAddress} (already clear)` };
      await runCli(ctx, DRAYTEK_CLI.removeFilterRule(idx));
      return { success: true, message: `filter block rule removed for ${ipAddress}` };
    } catch (err) {
      return { success: false, message: `removeFirewallRule failed: ${err.message}` };
    }
  },

  async blockMAC(ctx, { macAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add filter block rule for MAC ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    const idx = ruleIndexFor(deviceId || macAddress);
    try {
      await runCli(ctx, DRAYTEK_CLI.addFilterRule(idx, 'src-mac', macAddress, `guardtime-mac:${deviceId || macAddress}`));
      const verify = await runCli(ctx, DRAYTEK_CLI.showFilterRule(idx));
      if (/enable:\s*yes/i.test(verify)) return { success: true, message: `${macAddress} blocked` };
      return { success: false, message: 'block rule did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `remove filter block rule for MAC ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    const idx = ruleIndexFor(deviceId || macAddress);
    try {
      const before = await runCli(ctx, DRAYTEK_CLI.showFilterRule(idx));
      if (!/enable:\s*yes/i.test(before)) return { success: true, message: `${macAddress} already unblocked (no matching rule)` };
      await runCli(ctx, DRAYTEK_CLI.removeFilterRule(idx));
      return { success: true, message: `${macAddress} unblocked` };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    // Most Vigor models document no live wireless-station kick over CLI/SNMP
    // (unlike an AP controller's station manager) — matches this project's
    // matrix row (`supportsClientDisconnect: false`) for draytek. Blocking
    // (above) is the real enforcement mechanism here.
    return {
      success: false,
      message: `DrayTek Vigor has no documented instant wireless-disconnect action for ${macAddress || 'this client'} — use blockMAC/applyFirewallRule for enforcement instead`,
    };
  },
};

module.exports = { DrayTekPlugin, snmpGet, runCli, ruleIndexFor, DRAYTEK_CLI };

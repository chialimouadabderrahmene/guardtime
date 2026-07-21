'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// Ubiquiti EdgeRouter (EdgeOS) — management is via SSH CLI (Vyatta-derived
// `configure`/`set`/`commit`/`save` commands). EdgeOS does have HTTP
// config-tree endpoints, but Ubiquiti has never published them as a
// supported integration surface — matching the project's existing
// router-capability.matrix.ts row for this vendor (`EdgeOS-SSH-CLI`,
// `supportsAPI: false`), this plugin uses the SSH mechanism EdgeOS's own
// documentation describes for scripted management instead.
//
// Auth: an SSH key (ctx.credentials.privateKeyPath) is used when present;
// otherwise password auth via `sshpass` (config.sshpassBin — must be
// installed on the gateway-agent host, since `ssh` itself has no
// non-interactive password flag; same class of documented external
// dependency as python3+scapy already required for VPN/TLS detection).
//
// No EdgeRouter hardware is available in this environment to test
// against — command syntax matches EdgeOS's documented Vyatta-style CLI,
// unit-tested against a mocked execFile, not verified against real
// firmware (same honesty posture as unifi/index.js).

function dryRunResult(ctx, description) {
  if (!ctx.dryRun) return null;
  ctx.logger?.info(`[dry-run] edgerouter: ${description}`);
  return { success: true, message: `[dry-run] ${description}` };
}

function buildSshInvocation(ctx, remoteCommand) {
  const sshBin = ctx.sshBin || 'ssh';
  const port = ctx.port || 22;
  const username = ctx.credentials?.username || 'ubnt';
  const baseArgs = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=8', '-p', String(port)];
  if (ctx.credentials?.privateKeyPath) {
    baseArgs.push('-i', ctx.credentials.privateKeyPath);
  }
  baseArgs.push(`${username}@${ctx.ipAddress}`, remoteCommand);

  if (ctx.credentials?.privateKeyPath || !ctx.credentials?.password) {
    return { bin: sshBin, args: baseArgs };
  }
  const sshpassBin = ctx.sshpassBin || 'sshpass';
  return { bin: sshpassBin, args: ['-p', ctx.credentials.password, sshBin, ...baseArgs] };
}

/**
 * Runs a sequence of `set`/`delete` commands inside one non-interactive
 * `configure` session, framed by `commit`/`save`/`exit` — matches how
 * EdgeOS's own documentation describes scripted config changes over SSH.
 */
async function runVyattaCommands(ctx, commands) {
  const script = ['configure', ...commands, 'commit', 'save', 'exit'].join('; ');
  const { bin, args } = buildSshInvocation(ctx, script);
  const { stdout, stderr } = await execFileAsync(bin, args, { timeout: 10000 });
  const output = `${stdout || ''}${stderr || ''}`;
  if (/error|failed|illegal/i.test(output)) {
    throw new Error(`EdgeOS CLI reported an error: ${output.trim().slice(0, 300)}`);
  }
  return output;
}

async function showConfig(ctx, path) {
  const { bin, args } = buildSshInvocation(ctx, `show ${path}`);
  const { stdout } = await execFileAsync(bin, args, { timeout: 8000 });
  return stdout || '';
}

const RULESET = 'WAN_LOCAL';
// Deterministic rule index from the device/MAC id — idempotent re-apply,
// and removal targets exactly the rule this plugin created. Same technique
// as mark-allocator.js's stableId(), reimplemented locally to avoid a
// cross-module dependency for one small hash.
function ruleIndexFor(key) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 5000 + (Math.abs(hash) % 900); // 5000-5899, clear of default rule ranges
}

const EdgeRouterPlugin = {
  async detect(ctx) {
    try {
      const output = await showConfig(ctx, 'system host-name');
      return { success: true, message: 'EdgeRouter (EdgeOS) SSH CLI reachable', detail: output.trim() || undefined };
    } catch (err) {
      return { success: false, message: `detect failed: ${err.message}` };
    }
  },

  async login(ctx) {
    try {
      await showConfig(ctx, 'system host-name');
      return { success: true, message: 'SSH authentication OK' };
    } catch (err) {
      return { success: false, message: `login failed: ${err.message}` };
    }
  },

  async testConnection(ctx) {
    try {
      const output = await showConfig(ctx, 'system host-name');
      return { success: true, message: 'EdgeOS SSH connection OK', detail: output.trim() || undefined };
    } catch (err) {
      return { success: false, message: `EdgeOS SSH connection failed: ${err.message}` };
    }
  },

  async changeDNS(ctx, { dnsServer }) {
    const dry = dryRunResult(ctx, `set system name-server to ${dnsServer}`);
    if (dry) return dry;
    try {
      await runVyattaCommands(ctx, [`set system name-server ${dnsServer}`]);
      const after = await showConfig(ctx, 'system name-server');
      if (after.includes(dnsServer)) return { success: true, message: `DNS server set to ${dnsServer}` };
      return { success: false, message: 'DNS change did not verify' };
    } catch (err) {
      return { success: false, message: `changeDNS failed: ${err.message}` };
    }
  },

  async pauseDevice(ctx, target) {
    return EdgeRouterPlugin.applyFirewallRule(ctx, target);
  },

  async resumeDevice(ctx, target) {
    return EdgeRouterPlugin.removeFirewallRule(ctx, target);
  },

  async applyFirewallRule(ctx, { ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add firewall drop rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to add an EdgeOS firewall rule' };

    const index = ruleIndexFor(deviceId || ipAddress);
    try {
      await runVyattaCommands(ctx, [
        `set firewall name ${RULESET} rule ${index} action drop`,
        `set firewall name ${RULESET} rule ${index} source address ${ipAddress}`,
        `set firewall name ${RULESET} rule ${index} description guardtime:${deviceId || ipAddress}`,
      ]);
      const verify = await showConfig(ctx, `firewall name ${RULESET} rule ${index}`);
      if (/action\s+drop/.test(verify)) return { success: true, message: `firewall drop rule added for ${ipAddress}` };
      return { success: false, message: 'firewall rule did not verify' };
    } catch (err) {
      return { success: false, message: `applyFirewallRule failed: ${err.message}` };
    }
  },

  async removeFirewallRule(ctx, { ipAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `remove firewall drop rule for ${ipAddress}`);
    if (dry) return dry;
    if (!ipAddress) return { success: false, message: 'ipAddress is required to remove an EdgeOS firewall rule' };

    const index = ruleIndexFor(deviceId || ipAddress);
    try {
      const before = await showConfig(ctx, `firewall name ${RULESET} rule ${index}`);
      if (!before.trim()) return { success: true, message: `no firewall drop rule found for ${ipAddress} (already clear)` };
      await runVyattaCommands(ctx, [`delete firewall name ${RULESET} rule ${index}`]);
      return { success: true, message: `firewall drop rule removed for ${ipAddress}` };
    } catch (err) {
      return { success: false, message: `removeFirewallRule failed: ${err.message}` };
    }
  },

  async blockMAC(ctx, { macAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `add firewall drop rule for MAC ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    const index = ruleIndexFor(deviceId || macAddress);
    try {
      await runVyattaCommands(ctx, [
        `set firewall name ${RULESET} rule ${index} action drop`,
        `set firewall name ${RULESET} rule ${index} source mac-address ${macAddress}`,
        `set firewall name ${RULESET} rule ${index} description guardtime-mac:${deviceId || macAddress}`,
      ]);
      const verify = await showConfig(ctx, `firewall name ${RULESET} rule ${index}`);
      if (/action\s+drop/.test(verify)) return { success: true, message: `${macAddress} blocked` };
      return { success: false, message: 'block rule did not verify' };
    } catch (err) {
      return { success: false, message: `blockMAC failed: ${err.message}` };
    }
  },

  async unblockMAC(ctx, { macAddress, deviceId } = {}) {
    const dry = dryRunResult(ctx, `remove firewall drop rule for MAC ${macAddress}`);
    if (dry) return dry;
    if (!macAddress) return { success: false, message: 'macAddress is required' };

    const index = ruleIndexFor(deviceId || macAddress);
    try {
      const before = await showConfig(ctx, `firewall name ${RULESET} rule ${index}`);
      if (!before.trim()) return { success: true, message: `${macAddress} already unblocked (no matching rule)` };
      await runVyattaCommands(ctx, [`delete firewall name ${RULESET} rule ${index}`]);
      return { success: true, message: `${macAddress} unblocked` };
    } catch (err) {
      return { success: false, message: `unblockMAC failed: ${err.message}` };
    }
  },

  async disconnectClient(ctx, { macAddress } = {}) {
    // EdgeRouter is router-only hardware on most models — no built-in
    // wireless station table to "kick" the way UniFi/MikroTik AP firmware
    // does. Blocking (above) is the real enforcement mechanism here;
    // honestly reporting that a live disconnect isn't available rather
    // than pretending to do one.
    return {
      success: false,
      message: `EdgeRouter has no built-in wireless client table to disconnect ${macAddress || 'the device'} from — use blockMAC/applyFirewallRule for enforcement instead`,
    };
  },
};

module.exports = { EdgeRouterPlugin };

'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { VPN_PORT_SIGNATURES, VPN_IP_RANGES } = require('./vpn-patterns');
const execFileAsync = promisify(execFile);

const TABLE = 'guardtime';
const FORWARD_CHAIN = 'block';
const NAT_TABLE = 'guardtime_nat';
const NAT_CHAIN = 'dns_redirect';

/**
 * nftables-backed equivalent of IptablesController (Layer 3). Same public
 * shape (`sync({ targets, dnsRedirectIp, enableDnsRedirect })`) so
 * FirewallController can select either backend without callers caring which
 * is active.
 *
 * Rollback: before mutating anything, the current ruleset is snapshotted via
 * `nft list ruleset`. If any step in `sync()` throws, the snapshot is
 * restored via `nft -f <file>` so a partial/broken rule application never
 * lingers.
 */
class NftablesController {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async sync({ targets, dnsRedirectIp, enableDnsRedirect, enableQuicBlockGlobal }) {
    const snapshot = await this.snapshotRuleset();
    try {
      await this.ensureTable();
      await this.flushChain();

      for (const target of targets) {
        if (target.action === 'BLOCK') {
          await this.addBlockRules(target);
        }
        if (target.vpnBlock) {
          await this.addVpnBlockRules(target);
        }
        if (enableQuicBlockGlobal || target.quicBlock) {
          await this.addQuicBlockRule(target);
        }
      }

      if (enableDnsRedirect) {
        await this.ensureDnsRedirect(dnsRedirectIp);
      }
    } catch (err) {
      this.logger.error('nftables sync failed, rolling back to prior ruleset', {
        error: err.message,
      });
      await this.restoreRuleset(snapshot).catch((restoreErr) => {
        this.logger.error('nftables rollback ALSO failed — manual intervention required', {
          error: restoreErr.message,
        });
      });
      throw err;
    }
  }

  async ensureTable() {
    await this.run(['add', 'table', 'inet', TABLE], { ignoreFailure: true });
    await this.run(
      [
        'add', 'chain', 'inet', TABLE, FORWARD_CHAIN,
        '{', 'type', 'filter', 'hook', 'forward', 'priority', '0', ';', 'policy', 'accept', ';', '}',
      ],
      { ignoreFailure: true },
    );
  }

  async flushChain() {
    await this.run(['flush', 'chain', 'inet', TABLE, FORWARD_CHAIN]);
  }

  async addBlockRules(target) {
    const comment = `guardtime-${target.deviceId}`.slice(0, 63);

    if (target.ipAddress) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip', 'saddr', target.ipAddress,
        'counter', 'drop',
        'comment', `"${comment}-ip"`,
      ]);
    }
    if (target.macAddress) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ether', 'saddr', target.macAddress,
        'counter', 'drop',
        'comment', `"${comment}-mac"`,
      ]);
    }
  }

  async ensureDnsRedirect(dnsRedirectIp) {
    await this.run(['add', 'table', 'ip', NAT_TABLE], { ignoreFailure: true });
    await this.run(
      [
        'add', 'chain', 'ip', NAT_TABLE, NAT_CHAIN,
        '{', 'type', 'nat', 'hook', 'prerouting', 'priority', '-100', ';', '}',
      ],
      { ignoreFailure: true },
    );
    await this.run(['flush', 'chain', 'ip', NAT_TABLE, NAT_CHAIN]);
    await this.run([
      'add', 'rule', 'ip', NAT_TABLE, NAT_CHAIN,
      'udp', 'dport', '53', 'dnat', 'to', dnsRedirectIp,
    ]);
    await this.run([
      'add', 'rule', 'ip', NAT_TABLE, NAT_CHAIN,
      'tcp', 'dport', '53', 'dnat', 'to', dnsRedirectIp,
    ]);
  }

  /** Layer 5: drops known VPN protocol ports + endpoint IP ranges for one device. */
  async addVpnBlockRules(target) {
    if (!target.ipAddress) return;
    const comment = `guardtime-vpn-${target.deviceId}`.slice(0, 50);

    for (const sig of VPN_PORT_SIGNATURES) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip', 'saddr', target.ipAddress,
        sig.protocol, 'dport', String(sig.port),
        'counter', 'drop',
        'comment', `"${comment}-port-${sig.port}"`,
      ]);
    }

    for (const range of VPN_IP_RANGES) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip', 'saddr', target.ipAddress,
        'ip', 'daddr', range.cidr,
        'counter', 'drop',
        'comment', `"${comment}-ip"`,
      ]);
    }
  }

  /** Adds a rule dropping outbound UDP/443 (QUIC / HTTP-3) — Layer 6. */
  async addQuicBlockRule(target) {
    if (!target.ipAddress) return;
    const comment = `guardtime-quic-${target.deviceId}`.slice(0, 63);
    await this.run([
      'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
      'ip', 'saddr', target.ipAddress,
      'udp', 'dport', '443',
      'counter', 'drop',
      'comment', `"${comment}"`,
    ]);
  }

  async snapshotRuleset() {
    try {
      const { stdout } = await execFileAsync(this.config.nftBin, ['list', 'ruleset'], {
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (err) {
      this.logger.warn('nftables snapshot failed (rollback will be a no-op if needed)', {
        error: err.message,
      });
      return null;
    }
  }

  async restoreRuleset(snapshot) {
    if (snapshot === null || snapshot === undefined) return;
    const tmpFile = path.join(os.tmpdir(), `guardtime-nft-rollback-${Date.now()}.nft`);
    await fs.writeFile(tmpFile, snapshot, 'utf8');
    try {
      await execFileAsync(this.config.nftBin, ['-f', tmpFile], { timeout: 5000 });
      this.logger.info('nftables ruleset restored from pre-sync snapshot');
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async run(args, opts = {}) {
    const command = `${this.config.nftBin} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(this.config.nftBin, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

module.exports = { NftablesController };

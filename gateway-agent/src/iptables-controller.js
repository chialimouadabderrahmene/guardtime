'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { VPN_PORT_SIGNATURES, VPN_IP_RANGES } = require('./vpn-patterns');
const execFileAsync = promisify(execFile);

const FILTER_CHAIN = 'GUARDTIME_BLOCK';
const DNS_CHAIN = 'GUARDTIME_DNS';

class IptablesController {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Applies the desired rule set, rolling back to the pre-sync snapshot
   * (`iptables-save`/`iptables-restore`) if any step fails (Layer 3
   * "rollback on failure"). Existing call sites are unaffected — the public
   * signature and successful-path behaviour are unchanged.
   */
  async sync({ targets, dnsRedirectIp, enableDnsRedirect, enableQuicBlockGlobal }) {
    const snapshot = await this.snapshotRuleset();
    try {
      await this.ensureFilterChain();
      await this.flushFilterChain();

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
      this.logger.error('iptables sync failed, rolling back to prior ruleset', {
        error: err.message,
      });
      await this.restoreRuleset(snapshot).catch((restoreErr) => {
        this.logger.error('iptables rollback ALSO failed — manual intervention required', {
          error: restoreErr.message,
        });
      });
      throw err;
    }
  }

  /** Layer 5: drops known VPN protocol ports + endpoint IP ranges for one device. */
  async addVpnBlockRules(target) {
    if (!target.ipAddress) return;
    const comment = `guardtime-vpn:${target.deviceId}`;

    for (const sig of VPN_PORT_SIGNATURES) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-s', target.ipAddress,
        '-p', sig.protocol, '--dport', String(sig.port),
        '-m', 'comment', '--comment', `${comment}:port:${sig.port}`,
        '-j', 'DROP',
      ]);
    }

    for (const range of VPN_IP_RANGES) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-s', target.ipAddress,
        '-d', range.cidr,
        '-m', 'comment', '--comment', `${comment}:ip`,
        '-j', 'DROP',
      ]);
    }
  }

  /** Adds a rule dropping outbound UDP/443 (QUIC / HTTP-3) — Layer 6. */
  async addQuicBlockRule(target) {
    if (!target.ipAddress) return;
    await this.run([
      '-A', FILTER_CHAIN,
      '-s', target.ipAddress,
      '-p', 'udp', '--dport', '443',
      '-m', 'comment', '--comment', `guardtime-quic:${target.deviceId}`,
      '-j', 'DROP',
    ]);
  }

  async snapshotRuleset() {
    const saveBin = this.config.iptablesSaveBin || 'iptables-save';
    try {
      const { stdout } = await execFileAsync(saveBin, [], { timeout: 5000, maxBuffer: 10 * 1024 * 1024 });
      return stdout;
    } catch (err) {
      this.logger.warn('iptables snapshot failed (rollback will be a no-op if needed)', {
        error: err.message,
      });
      return null;
    }
  }

  async restoreRuleset(snapshot) {
    if (snapshot === null || snapshot === undefined) return;
    const restoreBin = this.config.iptablesRestoreBin || 'iptables-restore';
    const tmpFile = path.join(os.tmpdir(), `guardtime-iptables-rollback-${Date.now()}.rules`);
    await fs.writeFile(tmpFile, snapshot, 'utf8');
    try {
      await execFileAsync(restoreBin, [tmpFile], { timeout: 5000 });
      this.logger.info('iptables ruleset restored from pre-sync snapshot');
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async ensureFilterChain() {
    await this.run(['-N', FILTER_CHAIN], { ignoreFailure: true });
    await this.ensureRule(['-C', 'FORWARD', '-j', FILTER_CHAIN], ['-I', 'FORWARD', '1', '-j', FILTER_CHAIN]);
  }

  async flushFilterChain() {
    await this.run(['-F', FILTER_CHAIN]);
  }

  async addBlockRules(target) {
    const comment = `guardtime:${target.deviceId}`;

    if (target.ipAddress) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-s', target.ipAddress,
        '-m', 'comment', '--comment', `${comment}:ip`,
        '-j', 'DROP',
      ]);
    }

    if (target.macAddress) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-m', 'mac', '--mac-source', target.macAddress,
        '-m', 'comment', '--comment', `${comment}:mac`,
        '-j', 'DROP',
      ]);
    }
  }

  async ensureDnsRedirect(dnsRedirectIp) {
    await this.run(['-t', 'nat', '-N', DNS_CHAIN], { ignoreFailure: true });
    await this.run(['-t', 'nat', '-F', DNS_CHAIN]);
    await this.ensureNatRule(
      ['-t', 'nat', '-C', 'PREROUTING', '-p', 'udp', '--dport', '53', '-j', DNS_CHAIN],
      ['-t', 'nat', '-I', 'PREROUTING', '1', '-p', 'udp', '--dport', '53', '-j', DNS_CHAIN],
    );
    await this.ensureNatRule(
      ['-t', 'nat', '-C', 'PREROUTING', '-p', 'tcp', '--dport', '53', '-j', DNS_CHAIN],
      ['-t', 'nat', '-I', 'PREROUTING', '1', '-p', 'tcp', '--dport', '53', '-j', DNS_CHAIN],
    );

    await this.run([
      '-t', 'nat',
      '-A', DNS_CHAIN,
      '-p', 'udp',
      '--dport', '53',
      '-j', 'DNAT',
      '--to-destination', `${dnsRedirectIp}:53`,
    ]);
    await this.run([
      '-t', 'nat',
      '-A', DNS_CHAIN,
      '-p', 'tcp',
      '--dport', '53',
      '-j', 'DNAT',
      '--to-destination', `${dnsRedirectIp}:53`,
    ]);
  }

  async ensureRule(checkArgs, addArgs) {
    const exists = await this.run(checkArgs, { ignoreFailure: true, quiet: true });
    if (!exists.ok) await this.run(addArgs);
  }

  async ensureNatRule(checkArgs, addArgs) {
    const exists = await this.run(checkArgs, { ignoreFailure: true, quiet: true });
    if (!exists.ok) await this.run(addArgs);
  }

  async run(args, opts = {}) {
    const command = `${this.config.iptablesBin} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(this.config.iptablesBin, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

module.exports = { IptablesController };

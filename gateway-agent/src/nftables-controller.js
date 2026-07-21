'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { VPN_PORT_SIGNATURES, VPN_IP_RANGES } = require('./vpn-patterns');
const { DOH_PROVIDER_IPS, DOT_PORTS } = require('./doh-dot-patterns');
const { buildFirewallSyncSignature } = require('./firewall-sync-signature');
const execFileAsync = promisify(execFile);

const TABLE = 'guardtime';
const FORWARD_CHAIN = 'block';
const NAT_TABLE = 'guardtime_nat';
const NAT_CHAIN = 'dns_redirect';
// IPv6 DNAT needs its own family-specific nat table — nftables requires a
// nat/prerouting hook chain's family to match the packets it processes, so
// the v4 NAT_TABLE (family `ip`) can't also carry a v6 rule the way the
// `inet`-family FORWARD_CHAIN can for block/VPN/QUIC/DoH rules below.
const NAT_TABLE_V6 = 'guardtime_nat6';

/**
 * nftables-backed equivalent of IptablesController (Layer 3). Same public
 * shape (`sync({ targets, dnsRedirectIp, dnsRedirectIpv6, enableDnsRedirect,
 * enableDohBlock, enableQuicBlockGlobal })`) so FirewallController can
 * select either backend without callers caring which is active.
 *
 * IPv6: unlike iptables (which needs a wholly separate `ip6tables` binary
 * and chain set), nftables' `inet` family already processes both IPv4 and
 * IPv6 packets in one chain — so block/VPN/QUIC/DoH rules only need an
 * extra `ip6 saddr`/`ip6 daddr` variant added alongside the existing `ip`
 * one, in the SAME chain, not a second parallel sync pass. The DNS-redirect
 * DNAT is the one exception: nftables' nat/prerouting hook is
 * family-specific, so it needs its own small `ip6` family table
 * (NAT_TABLE_V6) mirroring NAT_TABLE.
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
    // Single family (`inet` spans v4+v6 in one pass), so unlike
    // IptablesController this only ever needs one remembered signature.
    this._lastSyncSignature = null;
  }

  async sync({ targets, dnsRedirectIp, dnsRedirectIpv6, enableDnsRedirect, enableQuicBlockGlobal, enableDohBlock }) {
    const signature = buildFirewallSyncSignature({
      targets,
      dnsRedirectIp,
      dnsRedirectIpv6,
      enableDnsRedirect,
      enableQuicBlockGlobal,
      enableDohBlock,
      enableIpv6: this.config.enableIpv6,
    });
    if (this._lastSyncSignature === signature) {
      this.logger.debug('nftables sync skipped — policy unchanged since last cycle');
      return;
    }

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

      if (enableDohBlock) {
        await this.addDohDotBlockRules();
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

    // Only remembered as "applied" once the v6 DNS-redirect sub-step (if
    // applicable) also succeeded — otherwise a signature-unchanged next
    // cycle would skip the ENTIRE sync, including retrying that failed v6
    // redirect, and it would never self-heal. `v6RedirectFailed` stays
    // false (so the signature IS cached) whenever v6 is disabled or no v6
    // resolver is configured, matching the pre-existing "just skip it, no
    // error" behavior for those cases.
    let v6RedirectFailed = false;
    if (this.config.enableIpv6) {
      const v6ResolverIp = dnsRedirectIpv6 || this.config.dnsRedirectIpv6;
      if (enableDnsRedirect && v6ResolverIp) {
        try {
          await this.ensureDnsRedirectV6(v6ResolverIp);
        } catch (err) {
          v6RedirectFailed = true;
          this.logger.error('nftables v6 DNS redirect failed — IPv4 DNS redirect is unaffected', {
            error: err.message,
          });
        }
      }
    }

    if (!v6RedirectFailed) {
      this._lastSyncSignature = signature;
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
    if (this.config.enableIpv6 && target.ipv6Address) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip6', 'saddr', target.ipv6Address,
        'counter', 'drop',
        'comment', `"${comment}-ip6"`,
      ]);
    }
    if (target.macAddress) {
      // `ether saddr` matches at the link layer, so this one rule already
      // blocks the device on both IPv4 and IPv6 traffic — no v6 variant needed.
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

  async ensureDnsRedirectV6(dnsRedirectIpv6) {
    await this.run(['add', 'table', 'ip6', NAT_TABLE_V6], { ignoreFailure: true });
    await this.run(
      [
        'add', 'chain', 'ip6', NAT_TABLE_V6, NAT_CHAIN,
        '{', 'type', 'nat', 'hook', 'prerouting', 'priority', '-100', ';', '}',
      ],
      { ignoreFailure: true },
    );
    await this.run(['flush', 'chain', 'ip6', NAT_TABLE_V6, NAT_CHAIN]);
    await this.run([
      'add', 'rule', 'ip6', NAT_TABLE_V6, NAT_CHAIN,
      'udp', 'dport', '53', 'dnat', 'to', dnsRedirectIpv6,
    ]);
    await this.run([
      'add', 'rule', 'ip6', NAT_TABLE_V6, NAT_CHAIN,
      'tcp', 'dport', '53', 'dnat', 'to', dnsRedirectIpv6,
    ]);
  }

  /** Layer 5: drops known VPN protocol ports + endpoint IP ranges for one device. */
  async addVpnBlockRules(target) {
    if (!target.ipAddress && !target.ipv6Address) return;
    const comment = `guardtime-vpn-${target.deviceId}`.slice(0, 50);

    for (const sig of VPN_PORT_SIGNATURES) {
      if (target.ipAddress) {
        await this.run([
          'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
          'ip', 'saddr', target.ipAddress,
          sig.protocol, 'dport', String(sig.port),
          'counter', 'drop',
          'comment', `"${comment}-port-${sig.port}"`,
        ]);
      }
      if (this.config.enableIpv6 && target.ipv6Address) {
        await this.run([
          'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
          'ip6', 'saddr', target.ipv6Address,
          sig.protocol, 'dport', String(sig.port),
          'counter', 'drop',
          'comment', `"${comment}-port-${sig.port}-v6"`,
        ]);
      }
    }

    if (target.ipAddress) {
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
  }

  /** Adds a rule dropping outbound UDP/443 (QUIC / HTTP-3) — Layer 6. */
  async addQuicBlockRule(target) {
    const comment = `guardtime-quic-${target.deviceId}`.slice(0, 63);
    if (target.ipAddress) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip', 'saddr', target.ipAddress,
        'udp', 'dport', '443',
        'counter', 'drop',
        'comment', `"${comment}"`,
      ]);
    }
    if (this.config.enableIpv6 && target.ipv6Address) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip6', 'saddr', target.ipv6Address,
        'udp', 'dport', '443',
        'counter', 'drop',
        'comment', `"${comment}-v6"`,
      ]);
    }
  }

  /**
   * DoH/DoT protection (Layer 8): drops port 853 unconditionally (one rule
   * covers both v4 and v6 traffic — `inet` family, no family-specific
   * matcher needed for a port-only match) and drops known DoH provider IPs
   * on 443. IP-list based, not SNI/DPI — see doh-dot-patterns.js.
   */
  async addDohDotBlockRules() {
    for (const port of DOT_PORTS) {
      await this.run(['add', 'rule', 'inet', TABLE, FORWARD_CHAIN, 'tcp', 'dport', String(port), 'counter', 'drop', 'comment', '"guardtime-dot-tcp"']);
      await this.run(['add', 'rule', 'inet', TABLE, FORWARD_CHAIN, 'udp', 'dport', String(port), 'counter', 'drop', 'comment', '"guardtime-dot-udp"']);
    }
    const reputationProviders = (this.config.dohReputationIps || []).map((ip) => ({ ip, name: 'operator-reputation-list' }));
    for (const provider of [...DOH_PROVIDER_IPS, ...reputationProviders]) {
      await this.run([
        'add', 'rule', 'inet', TABLE, FORWARD_CHAIN,
        'ip', 'daddr', provider.ip,
        'tcp', 'dport', '443',
        'counter', 'drop',
        'comment', `"guardtime-doh-${provider.name}"`,
      ]);
    }
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

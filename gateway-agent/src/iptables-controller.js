'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { VPN_PORT_SIGNATURES, VPN_IP_RANGES } = require('./vpn-patterns');
const { DOH_PROVIDER_IPS, DOT_PORTS } = require('./doh-dot-patterns');
const execFileAsync = promisify(execFile);

const FILTER_CHAIN = 'GUARDTIME_BLOCK';
const DNS_CHAIN = 'GUARDTIME_DNS';
const DOH_CHAIN = 'GUARDTIME_DOH';

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
   *
   * IPv6: every step below that has a `ipv6` boolean parameter is run twice
   * when `config.enableIpv6` is on — once against `iptables` (v4) and once
   * against `ip6tables` (v6), using the same target list. MAC-based rules
   * apply to a target with or without a known IPv6 address (MAC filtering
   * is link-layer, not IP-version-specific); IP-based rules for the v6 pass
   * only fire for targets that have `ipv6Address` set. A v6-stage failure
   * rolls back only the v6 ruleset — the v4 pass already succeeded and
   * stays applied, since a device having *some* working enforcement is
   * always better than none due to an unrelated v6 issue.
   */
  async sync({ targets, dnsRedirectIp, dnsRedirectIpv6, enableDnsRedirect, enableQuicBlockGlobal, enableDohBlock }) {
    await this.syncFamily({ targets, dnsRedirectIp, enableDnsRedirect, enableQuicBlockGlobal, enableDohBlock, ipv6: false });

    if (this.config.enableIpv6) {
      try {
        await this.syncFamily({
          targets,
          dnsRedirectIp: dnsRedirectIpv6 || this.config.dnsRedirectIpv6,
          enableDnsRedirect: enableDnsRedirect && Boolean(dnsRedirectIpv6 || this.config.dnsRedirectIpv6),
          enableQuicBlockGlobal,
          enableDohBlock,
          ipv6: true,
        });
      } catch (err) {
        this.logger.error('ip6tables sync failed — IPv4 enforcement is unaffected', { error: err.message });
      }
    }
  }

  async syncFamily({ targets, dnsRedirectIp, enableDnsRedirect, enableQuicBlockGlobal, enableDohBlock, ipv6 }) {
    const snapshot = await this.snapshotRuleset(ipv6);
    try {
      await this.ensureFilterChain(ipv6);
      await this.flushFilterChain(ipv6);

      for (const target of targets) {
        if (target.action === 'BLOCK') {
          await this.addBlockRules(target, ipv6);
        }
        if (target.vpnBlock) {
          await this.addVpnBlockRules(target, ipv6);
        }
        if (enableQuicBlockGlobal || target.quicBlock) {
          await this.addQuicBlockRule(target, ipv6);
        }
      }

      if (enableDohBlock) {
        await this.ensureDohDotBlock(ipv6);
      }

      if (enableDnsRedirect) {
        await this.ensureDnsRedirect(dnsRedirectIp, ipv6);
      }
    } catch (err) {
      this.logger.error(`${ipv6 ? 'ip6tables' : 'iptables'} sync failed, rolling back to prior ruleset`, {
        error: err.message,
      });
      await this.restoreRuleset(snapshot, ipv6).catch((restoreErr) => {
        this.logger.error(`${ipv6 ? 'ip6tables' : 'iptables'} rollback ALSO failed — manual intervention required`, {
          error: restoreErr.message,
        });
      });
      throw err;
    }
  }

  /** Layer 5: drops known VPN protocol ports + endpoint IP ranges for one device. */
  async addVpnBlockRules(target, ipv6 = false) {
    const address = ipv6 ? target.ipv6Address : target.ipAddress;
    if (!address) return;
    const comment = `guardtime-vpn:${target.deviceId}`;

    for (const sig of VPN_PORT_SIGNATURES) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-s', address,
        '-p', sig.protocol, '--dport', String(sig.port),
        '-m', 'comment', '--comment', `${comment}:port:${sig.port}`,
        '-j', 'DROP',
      ], { ipv6 });
    }

    if (!ipv6) {
      for (const range of VPN_IP_RANGES) {
        await this.run([
          '-A', FILTER_CHAIN,
          '-s', address,
          '-d', range.cidr,
          '-m', 'comment', '--comment', `${comment}:ip`,
          '-j', 'DROP',
        ], { ipv6 });
      }
    }
  }

  /** Adds a rule dropping outbound UDP/443 (QUIC / HTTP-3) — Layer 6. */
  async addQuicBlockRule(target, ipv6 = false) {
    const address = ipv6 ? target.ipv6Address : target.ipAddress;
    if (!address) return;
    await this.run([
      '-A', FILTER_CHAIN,
      '-s', address,
      '-p', 'udp', '--dport', '443',
      '-m', 'comment', '--comment', `guardtime-quic:${target.deviceId}`,
      '-j', 'DROP',
    ], { ipv6 });
  }

  /**
   * DoH/DoT protection: blocks DNS-over-TLS (port 853, both transports —
   * DoT has no legitimate non-DNS use) unconditionally, and DNAT-redirects
   * known DoH provider IPs' port-443 traffic into the same DNS chain so it
   * gets resolved by the controlled resolver instead of reaching the real
   * provider. This is IP-list based, not SNI/TLS inspection — see
   * doh-dot-patterns.js for why a full DPI approach isn't implemented here.
   */
  async ensureDohDotBlock(ipv6 = false) {
    await this.run(['-t', 'filter', '-N', DOH_CHAIN], { ignoreFailure: true, ipv6 });
    await this.run(['-t', 'filter', '-F', DOH_CHAIN], { ipv6 });
    await this.ensureRule(
      ['-C', 'FORWARD', '-j', DOH_CHAIN],
      ['-I', 'FORWARD', '1', '-j', DOH_CHAIN],
      { ipv6 },
    );

    for (const port of DOT_PORTS) {
      await this.run(['-A', DOH_CHAIN, '-p', 'tcp', '--dport', String(port), '-j', 'DROP'], { ipv6 });
      await this.run(['-A', DOH_CHAIN, '-p', 'udp', '--dport', String(port), '-j', 'DROP'], { ipv6 });
    }

    if (!ipv6) {
      for (const provider of DOH_PROVIDER_IPS) {
        await this.run(
          ['-A', DOH_CHAIN, '-d', provider.ip, '-p', 'tcp', '--dport', '443', '-m', 'comment', '--comment', `guardtime-doh:${provider.name}`, '-j', 'DROP'],
          { ipv6 },
        );
      }
    }
  }

  async snapshotRuleset(ipv6 = false) {
    const saveBin = ipv6 ? this.config.ip6tablesSaveBin || 'ip6tables-save' : this.config.iptablesSaveBin || 'iptables-save';
    try {
      const { stdout } = await execFileAsync(saveBin, [], { timeout: 5000, maxBuffer: 10 * 1024 * 1024 });
      return stdout;
    } catch (err) {
      this.logger.warn(`${saveBin} snapshot failed (rollback will be a no-op if needed)`, {
        error: err.message,
      });
      return null;
    }
  }

  async restoreRuleset(snapshot, ipv6 = false) {
    if (snapshot === null || snapshot === undefined) return;
    const restoreBin = ipv6
      ? this.config.ip6tablesRestoreBin || 'ip6tables-restore'
      : this.config.iptablesRestoreBin || 'iptables-restore';
    const tmpFile = path.join(os.tmpdir(), `guardtime-iptables-rollback-${ipv6 ? 'v6-' : ''}${Date.now()}.rules`);
    await fs.writeFile(tmpFile, snapshot, 'utf8');
    try {
      await execFileAsync(restoreBin, [tmpFile], { timeout: 5000 });
      this.logger.info(`${restoreBin} ruleset restored from pre-sync snapshot`);
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  async ensureFilterChain(ipv6 = false) {
    await this.run(['-N', FILTER_CHAIN], { ignoreFailure: true, ipv6 });
    await this.ensureRule(['-C', 'FORWARD', '-j', FILTER_CHAIN], ['-I', 'FORWARD', '1', '-j', FILTER_CHAIN], { ipv6 });
  }

  async flushFilterChain(ipv6 = false) {
    await this.run(['-F', FILTER_CHAIN], { ipv6 });
  }

  async addBlockRules(target, ipv6 = false) {
    const comment = `guardtime:${target.deviceId}`;
    const address = ipv6 ? target.ipv6Address : target.ipAddress;

    if (address) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-s', address,
        '-m', 'comment', '--comment', `${comment}:ip`,
        '-j', 'DROP',
      ], { ipv6 });
    }

    // MAC filtering is link-layer, not address-family-specific — applied to
    // both the v4 and v6 chains regardless of whether an IPv6 address has
    // been discovered yet, so a device is blocked on both protocols the
    // instant its MAC is seen, not only once its v6 address is known.
    if (target.macAddress) {
      await this.run([
        '-A', FILTER_CHAIN,
        '-m', 'mac', '--mac-source', target.macAddress,
        '-m', 'comment', '--comment', `${comment}:mac`,
        '-j', 'DROP',
      ], { ipv6 });
    }
  }

  async ensureDnsRedirect(dnsRedirectIp, ipv6 = false) {
    if (ipv6 && !dnsRedirectIp) return; // no v6-capable resolver configured — skip, don't blackhole v6 DNS
    await this.run(['-t', 'nat', '-N', DNS_CHAIN], { ignoreFailure: true, ipv6 });
    await this.run(['-t', 'nat', '-F', DNS_CHAIN], { ipv6 });
    await this.ensureNatRule(
      ['-t', 'nat', '-C', 'PREROUTING', '-p', 'udp', '--dport', '53', '-j', DNS_CHAIN],
      ['-t', 'nat', '-I', 'PREROUTING', '1', '-p', 'udp', '--dport', '53', '-j', DNS_CHAIN],
      { ipv6 },
    );
    await this.ensureNatRule(
      ['-t', 'nat', '-C', 'PREROUTING', '-p', 'tcp', '--dport', '53', '-j', DNS_CHAIN],
      ['-t', 'nat', '-I', 'PREROUTING', '1', '-p', 'tcp', '--dport', '53', '-j', DNS_CHAIN],
      { ipv6 },
    );

    await this.run([
      '-t', 'nat',
      '-A', DNS_CHAIN,
      '-p', 'udp',
      '--dport', '53',
      '-j', 'DNAT',
      '--to-destination', ipv6 ? `[${dnsRedirectIp}]:53` : `${dnsRedirectIp}:53`,
    ], { ipv6 });
    await this.run([
      '-t', 'nat',
      '-A', DNS_CHAIN,
      '-p', 'tcp',
      '--dport', '53',
      '-j', 'DNAT',
      '--to-destination', ipv6 ? `[${dnsRedirectIp}]:53` : `${dnsRedirectIp}:53`,
    ], { ipv6 });
  }

  async ensureRule(checkArgs, addArgs, opts = {}) {
    const exists = await this.run(checkArgs, { ...opts, ignoreFailure: true, quiet: true });
    if (!exists.ok) await this.run(addArgs, opts);
  }

  async ensureNatRule(checkArgs, addArgs, opts = {}) {
    const exists = await this.run(checkArgs, { ...opts, ignoreFailure: true, quiet: true });
    if (!exists.ok) await this.run(addArgs, opts);
  }

  async run(args, opts = {}) {
    const binary = opts.ipv6 ? this.config.ip6tablesBin || 'ip6tables' : this.config.iptablesBin;
    const command = `${binary} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(binary, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

module.exports = { IptablesController };

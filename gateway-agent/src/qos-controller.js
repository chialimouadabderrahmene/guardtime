'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { domainsForCategory } = require('./category-domains');
const { stableId } = require('./mark-allocator');

const ROOT_HANDLE = '1:';
const ROOT_CLASS = '1:1';
const THROTTLE_CLASS = '1:10';
const DEFAULT_CLASS = '1:30';

class QosController {
  constructor(config, logger, metrics, dnsResolveCache) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.dnsResolveCache = dnsResolveCache;
  }

  async sync(targets) {
    if (!this.config.enableQos || this.config.qosInterfaces.length === 0) return;

    const throttled = targets.filter((target) => target.action === 'THROTTLE' && target.ipAddress);
    const downloadInterfaces = this.config.lanInterface ? [this.config.lanInterface] : this.config.qosInterfaces;
    const uploadInterfaces = this.config.wanInterface ? [this.config.wanInterface] : this.config.qosInterfaces;
    const allInterfaces = [...new Set([...this.config.qosInterfaces, ...downloadInterfaces, ...uploadInterfaces])];

    for (const iface of allInterfaces) {
      await this.ensureQdisc(iface);
      await this.clearFilters(iface);
    }

    for (const iface of this.config.qosInterfaces) {
      for (const target of throttled) {
        await this.addThrottleFilters(iface, target.ipAddress);
      }
    }

    if (this.config.enableBandwidthControl) {
      await this.syncBandwidthLimits(targets, { downloadInterfaces, uploadInterfaces });
    }
  }

  async ensureQdisc(iface) {
    await this.run(['qdisc', 'replace', 'dev', iface, 'root', 'handle', ROOT_HANDLE, 'htb', 'default', '30']);
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_HANDLE,
      'classid', ROOT_CLASS,
      'htb', 'rate', this.config.qosDefaultRate,
    ]);
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_CLASS,
      'classid', THROTTLE_CLASS,
      'htb', 'rate', this.config.qosRate,
      'ceil', this.config.qosRate,
    ]);
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_CLASS,
      'classid', DEFAULT_CLASS,
      'htb', 'rate', this.config.qosDefaultRate,
    ]);
  }

  async clearFilters(iface) {
    await this.run(['filter', 'del', 'dev', iface, 'protocol', 'ip', 'parent', ROOT_HANDLE], {
      ignoreFailure: true,
      quiet: true,
    });
  }

  async addThrottleFilters(iface, ipAddress) {
    await this.run([
      'filter', 'add', 'dev', iface,
      'protocol', 'ip',
      'parent', ROOT_HANDLE,
      'prio', '10',
      'u32',
      'match', 'ip', 'src', ipAddress,
      'flowid', THROTTLE_CLASS,
    ]);
    await this.run([
      'filter', 'add', 'dev', iface,
      'protocol', 'ip',
      'parent', ROOT_HANDLE,
      'prio', '11',
      'u32',
      'match', 'ip', 'dst', ipAddress,
      'flowid', THROTTLE_CLASS,
    ]);
  }

  /**
   * Layer 7: per-device and per-category HTB classes driven by each
   * target's `bandwidthLimits` (from the backend's BandwidthLimit policy
   * resolution). Runs after clearFilters(), so a removed/changed policy
   * takes effect on the very next poll cycle ("dynamic update, instant
   * apply") without needing to diff old vs. new state.
   */
  async syncBandwidthLimits(targets, { downloadInterfaces, uploadInterfaces }) {
    const withLimits = targets.filter(
      (target) => target.ipAddress && Array.isArray(target.bandwidthLimits) && target.bandwidthLimits.length > 0,
    );
    if (withLimits.length === 0) return;

    let applied = 0;
    for (const target of withLimits) {
      for (const limit of target.bandwidthLimits) {
        const categoryIps = limit.category
          ? await this.dnsResolveCache.resolveAll(domainsForCategory(limit.category), this.logger)
          : null;

        if (limit.downloadKbps) {
          const classId = this.bandwidthClassId(target.deviceId, limit.category, 'dl');
          const matches = categoryIps
            ? categoryIps.map((ip) => ({ src: ip, dst: target.ipAddress }))
            : [{ dst: target.ipAddress }];
          applied += await this.applyDirectionalLimit({
            interfaces: downloadInterfaces,
            classId,
            rateKbps: limit.downloadKbps,
            matches,
          });
        }

        if (limit.uploadKbps) {
          const classId = this.bandwidthClassId(target.deviceId, limit.category, 'ul');
          const matches = categoryIps
            ? categoryIps.map((ip) => ({ src: target.ipAddress, dst: ip }))
            : [{ src: target.ipAddress }];
          applied += await this.applyDirectionalLimit({
            interfaces: uploadInterfaces,
            classId,
            rateKbps: limit.uploadKbps,
            matches,
          });
        }
      }
    }

    if (applied > 0) {
      this.metrics.inc('bandwidth.rulesApplied', applied);
      this.logger.info('bandwidth limits enforced', { rules: applied, devices: withLimits.length });
    }
  }

  async applyDirectionalLimit({ interfaces, classId, rateKbps, matches }) {
    let count = 0;
    for (const iface of interfaces) {
      try {
        await this.ensureBandwidthClass(iface, classId, rateKbps);
        for (const match of matches) {
          await this.addBandwidthFilter(iface, classId, match);
          count += 1;
        }
      } catch (err) {
        this.logger.error('bandwidth control failed on interface, removing shaping for safety', {
          iface,
          error: err.message,
        });
        // No atomic tc "restore prior state" primitive exists (unlike
        // iptables-save/-restore) — the safe rollback is to drop our qdisc
        // entirely (fail-open to unshaped traffic) rather than leave a
        // half-applied, possibly-broken rate limit in place. The next
        // successful cycle rebuilds everything from scratch anyway.
        await this.run(['qdisc', 'del', 'dev', iface, 'root'], { ignoreFailure: true, quiet: true });
        this.metrics.inc('bandwidth.rollback');
      }
    }
    return count;
  }

  bandwidthClassId(deviceId, category, direction) {
    const key = category ? `${deviceId}:${category}:${direction}` : `${deviceId}:${direction}`;
    return `1:${stableId(key, { min: 0x100, max: 0x7fff }).toString(16)}`;
  }

  async ensureBandwidthClass(iface, classId, rateKbps) {
    await this.run([
      'class', 'replace', 'dev', iface,
      'parent', ROOT_CLASS,
      'classid', classId,
      'htb', 'rate', `${rateKbps}kbit`,
      'ceil', `${rateKbps}kbit`,
    ]);
  }

  async addBandwidthFilter(iface, classId, { src, dst }) {
    const args = ['filter', 'add', 'dev', iface, 'protocol', 'ip', 'parent', ROOT_HANDLE, 'prio', '20', 'u32'];
    if (src) args.push('match', 'ip', 'src', src);
    if (dst) args.push('match', 'ip', 'dst', dst);
    args.push('flowid', classId);
    await this.run(args);
  }

  async run(args, opts = {}) {
    const command = `${this.config.tcBin} ${args.join(' ')}`;
    if (this.config.dryRun) {
      if (!opts.quiet) this.logger.info(`[dry-run] ${command}`);
      return { ok: true, stdout: '', stderr: '' };
    }

    try {
      const result = await execFileAsync(this.config.tcBin, args, { timeout: 5000 });
      if (!opts.quiet) this.logger.debug(command);
      return { ok: true, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      if (opts.ignoreFailure) return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message };
      throw new Error(`${command} failed: ${err.stderr || err.message}`);
    }
  }
}

module.exports = { QosController };

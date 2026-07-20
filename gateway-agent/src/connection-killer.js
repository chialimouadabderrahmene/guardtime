'use strict';

const { retry } = require('./retry');

/**
 * Orchestrates immediate connection termination when a device transitions
 * into BLOCK (parent presses Block Internet / Gaming Lock / Bedtime engages)
 * — Layer 3. Extracted from main.js so it can be unit tested in isolation and
 * so retry/rollback-adjacent safety (management-guard, metrics) live in one
 * audited place instead of being duplicated by every caller.
 *
 * Behaviour is unchanged from the pre-Layer-3 inline implementation in one
 * important way: it still only fires on a BLOCK transition (not on every
 * cycle while already blocked), still captures conntrack flows before
 * killing them, and still follows conntrack-kill with a TCP RST injection.
 * What's new: per-target retry with backoff, concurrent (not sequential)
 * dispatch across devices, a management-guard check so the gateway's own
 * connection can never be targeted, and metrics counters.
 */
class ConnectionKiller {
  constructor({ conntrack, tcpReset, managementGuard, metrics, logger }) {
    this.conntrack = conntrack;
    this.tcpReset = tcpReset;
    this.managementGuard = managementGuard;
    this.metrics = metrics;
    this.logger = logger;
    this.previousStates = new Map();
  }

  _shouldRun(target) {
    const previous = this.previousStates.get(target.deviceId);
    return (
      target.action === 'BLOCK' &&
      (!!target.ipAddress || !!target.ipv6Address) &&
      (!previous ||
        previous.action !== 'BLOCK' ||
        previous.ipAddress !== target.ipAddress ||
        previous.ipv6Address !== target.ipv6Address ||
        previous.macAddress !== target.macAddress)
    );
  }

  _rememberStates(targets) {
    const seen = new Set();
    for (const target of targets) {
      seen.add(target.deviceId);
      this.previousStates.set(target.deviceId, {
        action: target.action,
        ipAddress: target.ipAddress,
        ipv6Address: target.ipv6Address,
        macAddress: target.macAddress,
      });
    }
    for (const deviceId of this.previousStates.keys()) {
      if (!seen.has(deviceId)) this.previousStates.delete(deviceId);
    }
  }

  /** Runs the full conntrack-flush + TCP-RST chain for one address (v4 or v6) of a target. */
  async _killAddress(target, ipAddress) {
    const flows = await this.conntrack.listTcpConnections(ipAddress).catch((err) => {
      this.logger.warn('failed to capture tcp flows before block', {
        deviceId: target.deviceId,
        ipAddress,
        error: err.message,
      });
      return [];
    });

    this.logger.info('active block transition detected', {
      deviceId: target.deviceId,
      ipAddress,
      macAddress: target.macAddress,
      tcpFlows: flows.length,
    });

    await retry(() => this.conntrack.killDevice(ipAddress), {
      attempts: 3,
      delayMs: 150,
      onRetry: (err, attempt) => {
        this.metrics.inc('connectionKiller.retries');
        this.logger.warn('conntrack kill retry', {
          deviceId: target.deviceId,
          ipAddress,
          attempt,
          error: err.message,
        });
      },
    });
    await this.tcpReset.killDevice(ipAddress, flows);
  }

  /**
   * Kills both addresses of a target independently so a v6-only failure
   * (e.g. no ip6tables/conntrack IPv6 support on this host) doesn't prevent
   * the v4 kill from completing, and vice versa.
   */
  async _killOne(target) {
    this.metrics.inc('connectionKiller.attempts');
    const addresses = [target.ipAddress, target.ipv6Address].filter(Boolean);

    const results = await Promise.allSettled(addresses.map((address) => this._killAddress(target, address)));
    const anySucceeded = results.some((result) => result.status === 'fulfilled');
    const anyFailed = results.some((result) => result.status === 'rejected');

    if (anySucceeded) this.metrics.inc('connectionKiller.killed');
    if (anyFailed) {
      this.metrics.inc('connectionKiller.failed');
      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.error('connection kill failed after retries exhausted', {
            deviceId: target.deviceId,
            error: result.reason?.message || String(result.reason),
          });
        }
      }
    }
  }

  /**
   * Runs termination for every target that just transitioned to BLOCK, then
   * records ALL targets' states (killed or not) so the next cycle can detect
   * the next transition correctly.
   */
  async sync(targets) {
    const candidates = targets.filter((target) => this._shouldRun(target));
    const safe = this.managementGuard.filterTargets(candidates);

    if (safe.length < candidates.length) {
      this.metrics.inc('connectionKiller.protectedSkipped', candidates.length - safe.length);
    }

    await Promise.allSettled(safe.map((target) => this._killOne(target)));
    this._rememberStates(targets);
  }
}

module.exports = { ConnectionKiller };

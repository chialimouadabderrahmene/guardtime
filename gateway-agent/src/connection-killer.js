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
      !!target.ipAddress &&
      (!previous ||
        previous.action !== 'BLOCK' ||
        previous.ipAddress !== target.ipAddress ||
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
        macAddress: target.macAddress,
      });
    }
    for (const deviceId of this.previousStates.keys()) {
      if (!seen.has(deviceId)) this.previousStates.delete(deviceId);
    }
  }

  async _killOne(target) {
    this.metrics.inc('connectionKiller.attempts');

    const flows = await this.conntrack.listTcpConnections(target.ipAddress).catch((err) => {
      this.logger.warn('failed to capture tcp flows before block', {
        deviceId: target.deviceId,
        error: err.message,
      });
      return [];
    });

    this.logger.info('active block transition detected', {
      deviceId: target.deviceId,
      ipAddress: target.ipAddress,
      macAddress: target.macAddress,
      tcpFlows: flows.length,
    });

    try {
      await retry(() => this.conntrack.killDevice(target.ipAddress), {
        attempts: 3,
        delayMs: 150,
        onRetry: (err, attempt) => {
          this.metrics.inc('connectionKiller.retries');
          this.logger.warn('conntrack kill retry', {
            deviceId: target.deviceId,
            attempt,
            error: err.message,
          });
        },
      });
      await this.tcpReset.killDevice(target.ipAddress, flows);
      this.metrics.inc('connectionKiller.killed');
    } catch (err) {
      this.metrics.inc('connectionKiller.failed');
      this.logger.error('connection kill failed after retries exhausted', {
        deviceId: target.deviceId,
        error: err.message,
      });
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

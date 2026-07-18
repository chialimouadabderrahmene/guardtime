'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const SELF_IP_RE = /\bsrc\s+(\d{1,3}(?:\.\d{1,3}){3})\b/;

/**
 * Safety guard so enforcement (block / kill-connection / throttle / VPN /
 * QUIC / bandwidth rules) can NEVER be applied against the gateway's own
 * management path — i.e. the IP the agent itself uses to reach the backend,
 * plus any operator-configured admin IPs. This is the Layer 3 "never kill
 * Gateway management connection" requirement, and it is enforced centrally so
 * every controller benefits from one audited guard instead of each
 * controller reimplementing the check.
 */
class ManagementGuard {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    // Explicit allowlist always wins, regardless of dynamic detection.
    this.staticIps = new Set(
      (config.managementIps || [])
        .map((ip) => ip.trim())
        .filter(Boolean),
    );
    this.detectedIp = null;
  }

  /** Re-detect this host's outbound-facing IP (best-effort; never throws). */
  async refresh() {
    try {
      const { stdout } = await execFileAsync(
        this.config.ipBin,
        ['route', 'get', '1.1.1.1'],
        { timeout: 3000 },
      );
      const match = stdout.match(SELF_IP_RE);
      if (match) {
        this.detectedIp = match[1];
      }
    } catch (err) {
      this.logger.debug('management-guard: self-IP detection failed', { error: err.message });
    }
    return this.detectedIp;
  }

  isProtectedIp(ipAddress) {
    if (!ipAddress) return false;
    if (this.staticIps.has(ipAddress)) return true;
    if (this.detectedIp && this.detectedIp === ipAddress) return true;
    return false;
  }

  /**
   * Filters a list of enforcement targets, dropping (and logging) any whose
   * ipAddress resolves to the gateway's own management path. Use this as the
   * single choke point before dispatching block/kill/throttle/VPN/QUIC rules.
   */
  filterTargets(targets) {
    const safe = [];
    for (const target of targets) {
      if (this.isProtectedIp(target.ipAddress)) {
        this.logger.warn('management-guard: refusing to enforce against protected IP', {
          deviceId: target.deviceId,
          ipAddress: target.ipAddress,
        });
        continue;
      }
      safe.push(target);
    }
    return safe;
  }
}

module.exports = { ManagementGuard };

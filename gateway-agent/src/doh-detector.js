'use strict';

const { DOT_PORTS, matchDohIp } = require('./doh-dot-patterns');

/**
 * Layer 8: watches each target's TCP conntrack flows for DoT (port 853,
 * any destination — DoT has no other legitimate use) and DoH-to-a-known-
 * provider-IP (port 443 to an address in DOH_PROVIDER_IPS). Same shape as
 * VpnDetector (Layer 5) deliberately — detection is unconditional and
 * log/report-only; the actual block happens in firewall.sync()'s
 * ensureDohDotBlock(), independent of whether this class ever runs.
 */
class DohDetector {
  constructor({ conntrack, metrics, logger }) {
    this.conntrack = conntrack;
    this.metrics = metrics;
    this.logger = logger;
  }

  async _detectForTarget(target) {
    const detections = [];

    const tcpFlows = await this.conntrack.listTcpConnections(target.ipAddress).catch((err) => {
      this.logger.warn('doh-detector: failed to list tcp flows', { deviceId: target.deviceId, error: err.message });
      return [];
    });

    for (const flow of tcpFlows) {
      if (DOT_PORTS.includes(flow.dport)) {
        detections.push({ method: 'conntrack-port-853', provider: 'DoT', detail: String(flow.dport) });
        continue;
      }
      if (flow.dport === 443) {
        const provider = matchDohIp(flow.dst);
        if (provider) detections.push({ method: 'conntrack-doh-ip', provider, detail: flow.dst });
      }
    }

    return detections;
  }

  /** Returns the flat list of detections across all targets, for reporting upstream. */
  async sync(targets) {
    const report = [];

    for (const target of targets) {
      if (!target.ipAddress) continue;

      const detections = await this._detectForTarget(target);
      for (const detection of detections) {
        this.metrics.inc('dohDetector.detections');
        this.logger.warn('encrypted dns (doh/dot) detected', {
          deviceId: target.deviceId,
          provider: detection.provider,
          method: detection.method,
          detail: detection.detail,
        });
        report.push({ deviceId: target.deviceId, ...detection });
      }
    }

    return report;
  }
}

module.exports = { DohDetector };

'use strict';

const { matchVpnDomain, matchVpnPort, matchVpnIp } = require('./vpn-patterns');

/**
 * Layer 5: watches each target's UDP conntrack flows and (optionally) a
 * short DNS sniff, flags anything matching a known VPN signature, and logs
 * + counts every detection. Detection is unconditional ("log every
 * detection"); enforcement is a separate, always-on concern driven by each
 * device's `vpnBlock` policy flag inside firewall.sync() — this class never
 * touches the firewall itself.
 */
class VpnDetector {
  constructor({ conntrack, dnsSniff, metrics, logger }) {
    this.conntrack = conntrack;
    this.dnsSniff = dnsSniff;
    this.metrics = metrics;
    this.logger = logger;
  }

  async _detectForTarget(target) {
    const detections = [];

    const udpFlows = await this.conntrack.listUdpConnections(target.ipAddress).catch((err) => {
      this.logger.warn('vpn-detector: failed to list udp flows', { deviceId: target.deviceId, error: err.message });
      return [];
    });

    for (const flow of udpFlows) {
      const ipProvider = matchVpnIp(flow.dst);
      if (ipProvider) detections.push({ method: 'ip-range', provider: ipProvider, detail: flow.dst });

      const portProvider = matchVpnPort('udp', flow.dport);
      if (portProvider) detections.push({ method: 'port-signature', provider: portProvider, detail: String(flow.dport) });
    }

    const queries = await this.dnsSniff.captureDnsQueries(target.ipAddress);
    for (const domain of queries) {
      const domainProvider = matchVpnDomain(domain);
      if (domainProvider) detections.push({ method: 'dns-pattern', provider: domainProvider, detail: domain });
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
        this.metrics.inc('vpnDetector.detections');
        this.logger.warn('vpn detected', {
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

module.exports = { VpnDetector };

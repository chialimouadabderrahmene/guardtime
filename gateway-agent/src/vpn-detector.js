'use strict';

const { matchVpnDomain, matchVpnPort, matchVpnPortDetectionOnly, matchVpnIp } = require('./vpn-patterns');

/**
 * Layer 5: watches each target's UDP conntrack flows and (optionally) a
 * short DNS sniff, flags anything matching a known VPN signature, and logs
 * + counts every detection. Detection is unconditional ("log every
 * detection"); enforcement is a separate, always-on concern driven by each
 * device's `vpnBlock` policy flag inside firewall.sync() — this class never
 * touches the firewall itself.
 */
class VpnDetector {
  constructor({ conntrack, dnsSniff, tlsFingerprint, metrics, logger }) {
    this.conntrack = conntrack;
    this.dnsSniff = dnsSniff;
    // Optional — main.js only wires this in when ENABLE_TLS_FINGERPRINT is
    // set. Absent, this detector behaves exactly as before JA3 support was
    // added (no new required constructor arg, no behaviour change).
    this.tlsFingerprint = tlsFingerprint || null;
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

    // TCP-based signatures (PPTP, SoftEther's dedicated ports, plus the
    // detection-only generic-proxy ports) — separate from the UDP scan
    // above since most VPN protocols are UDP, but a few common ones aren't.
    const tcpFlows = await this.conntrack.listTcpConnections(target.ipAddress).catch((err) => {
      this.logger.warn('vpn-detector: failed to list tcp flows', { deviceId: target.deviceId, error: err.message });
      return [];
    });

    for (const flow of tcpFlows) {
      const portProvider = matchVpnPort('tcp', flow.dport);
      if (portProvider) {
        detections.push({ method: 'port-signature', provider: portProvider, detail: String(flow.dport) });
        continue;
      }
      const lowConfidenceProvider = matchVpnPortDetectionOnly('tcp', flow.dport);
      if (lowConfidenceProvider) {
        detections.push({ method: 'port-signature-low-confidence', provider: lowConfidenceProvider, detail: String(flow.dport) });
      }
    }

    const queries = await this.dnsSniff.captureDnsQueries(target.ipAddress);
    for (const domain of queries) {
      const domainProvider = matchVpnDomain(domain);
      if (domainProvider) detections.push({ method: 'dns-pattern', provider: domainProvider, detail: domain });
    }

    if (this.tlsFingerprint) {
      const tlsDetections = await this.tlsFingerprint.detectForTarget(target).catch((err) => {
        this.logger.warn('vpn-detector: tls fingerprint detection failed', { deviceId: target.deviceId, error: err.message });
        return [];
      });
      detections.push(...tlsDetections);
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

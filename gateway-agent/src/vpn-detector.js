'use strict';

const { matchVpnDomain, matchVpnPort, matchVpnPortDetectionOnly, matchVpnIp } = require('./vpn-patterns');

// Common UDP service ports many devices legitimately talk to several
// different destinations on at once (DNS, DHCP, NTP, QUIC/HTTP3, mDNS) —
// excluded from the flow heuristic below so ordinary browsing/streaming
// doesn't trip it.
const COMMON_MULTI_DEST_UDP_PORTS = new Set([53, 67, 68, 123, 443, 5353]);
const FLOW_HEURISTIC_MIN_PEERS = 3;
const FLOW_HEURISTIC_WEIGHT = 25; // intentionally low — see detectFlowAnomaly's doc comment

/**
 * Weak, independent supplementary signal: several concurrent UDP flows to
 * DIFFERENT destination IPs on the exact same non-standard port. Ordinary
 * client/server traffic varies destination ports per service; a device
 * maintaining several simultaneous peer connections on one fixed port is
 * the pattern mesh-style VPN clients (Tailscale, ZeroTier, some WireGuard
 * multi-peer configs) show, but it is NOT a reliable standalone indicator —
 * some legitimate P2P/multiplayer software does this too. Deliberately
 * weighted low (25/100) and only ever combined with other signals via
 * computeConfidence(), never surfaced as its own "VPN detected" claim.
 */
function detectFlowAnomaly(udpFlows) {
  const peersByPort = new Map();
  for (const flow of udpFlows) {
    if (COMMON_MULTI_DEST_UDP_PORTS.has(flow.dport)) continue;
    if (!peersByPort.has(flow.dport)) peersByPort.set(flow.dport, new Set());
    peersByPort.get(flow.dport).add(flow.dst);
  }
  for (const [port, peers] of peersByPort) {
    if (peers.size >= FLOW_HEURISTIC_MIN_PEERS) {
      return {
        method: 'flow-heuristic',
        provider: 'unknown (multi-peer UDP pattern)',
        detail: `port ${port}, ${peers.size} distinct peers`,
        weight: FLOW_HEURISTIC_WEIGHT,
      };
    }
  }
  return null;
}

/**
 * Combines independent per-signal weights (0-100) into one overall score
 * via noisy-OR: each signal is treated as independent evidence, so overall
 * confidence rises with each additional corroborating signal but never
 * exceeds 100 and never simply sums past it. This is a standard heuristic
 * combination technique, not a calibrated probability — there is no
 * labeled traffic dataset in this environment to fit real probabilities
 * against (same honesty note as the per-signature weights themselves in
 * vpn-patterns.js). One weak flow-heuristic hit alone yields a low score
 * (25); a port-signature match alone yields a high score (70-90); several
 * independent hits compound toward, but never reach, 100.
 */
function computeConfidence(weights) {
  if (weights.length === 0) return 0;
  const missProbability = weights.reduce((acc, w) => acc * (1 - w / 100), 1);
  return Math.round((1 - missProbability) * 100);
}

/**
 * Layer 5: watches each target's UDP/TCP conntrack flows, an optional DNS
 * sniff, and (optionally) TLS fingerprints, flags anything matching a known
 * VPN signature, and logs + counts every detection. Detection is
 * unconditional ("log every detection"); enforcement is a separate,
 * always-on concern driven by each device's `vpnBlock` policy flag inside
 * firewall.sync() — this class never touches the firewall itself.
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
      const ipMatch = matchVpnIp(flow.dst);
      if (ipMatch) detections.push({ method: 'ip-range', provider: ipMatch.provider, detail: flow.dst, confidence: ipMatch.weight });

      const portMatch = matchVpnPort('udp', flow.dport);
      if (portMatch) detections.push({ method: 'port-signature', provider: portMatch.provider, detail: String(flow.dport), confidence: portMatch.weight });
    }

    const flowAnomaly = detectFlowAnomaly(udpFlows);
    if (flowAnomaly) {
      detections.push({ ...flowAnomaly, confidence: flowAnomaly.weight });
    }

    // TCP-based signatures (PPTP, SoftEther's dedicated ports, plus the
    // detection-only generic-proxy ports) — separate from the UDP scan
    // above since most VPN protocols are UDP, but a few common ones aren't.
    const tcpFlows = await this.conntrack.listTcpConnections(target.ipAddress).catch((err) => {
      this.logger.warn('vpn-detector: failed to list tcp flows', { deviceId: target.deviceId, error: err.message });
      return [];
    });

    for (const flow of tcpFlows) {
      const portMatch = matchVpnPort('tcp', flow.dport);
      if (portMatch) {
        detections.push({ method: 'port-signature', provider: portMatch.provider, detail: String(flow.dport), confidence: portMatch.weight });
        continue;
      }
      const lowConfidenceMatch = matchVpnPortDetectionOnly('tcp', flow.dport);
      if (lowConfidenceMatch) {
        detections.push({
          method: 'port-signature-low-confidence',
          provider: lowConfidenceMatch.provider,
          detail: String(flow.dport),
          confidence: lowConfidenceMatch.weight,
        });
      }
    }

    const queries = await this.dnsSniff.captureDnsQueries(target.ipAddress);
    for (const domain of queries) {
      const domainMatch = matchVpnDomain(domain);
      if (domainMatch) detections.push({ method: 'dns-pattern', provider: domainMatch.provider, detail: domain, confidence: domainMatch.weight });
    }

    if (this.tlsFingerprint) {
      const tlsDetections = await this.tlsFingerprint.detectForTarget(target).catch((err) => {
        this.logger.warn('vpn-detector: tls fingerprint detection failed', { deviceId: target.deviceId, error: err.message });
        return [];
      });
      // An operator-verified JA3 match is high-confidence by construction —
      // the operator explicitly configured that exact hash as known-bad.
      detections.push(...tlsDetections.map((d) => ({ ...d, confidence: d.confidence ?? 90 })));
    }

    return detections;
  }

  /**
   * Returns the flat list of detections across all targets, each carrying
   * its own signal-level `confidence` plus an `overallConfidence` for that
   * device (noisy-OR combination of every signal that fired for it this
   * cycle) — denormalized onto every row so existing flat-array consumers
   * (backend's /gateway/vpn-detections) don't need a second aggregate
   * structure to read it.
   */
  async sync(targets) {
    const report = [];

    for (const target of targets) {
      if (!target.ipAddress) continue;

      const detections = await this._detectForTarget(target);
      if (detections.length === 0) continue;

      const overallConfidence = computeConfidence(detections.map((d) => d.confidence));

      for (const detection of detections) {
        this.metrics.inc('vpnDetector.detections');
        this.logger.warn('vpn detected', {
          deviceId: target.deviceId,
          provider: detection.provider,
          method: detection.method,
          detail: detection.detail,
          confidence: detection.confidence,
          overallConfidence,
        });
        report.push({ deviceId: target.deviceId, ...detection, overallConfidence });
      }
    }

    return report;
  }
}

module.exports = { VpnDetector, computeConfidence, detectFlowAnomaly };

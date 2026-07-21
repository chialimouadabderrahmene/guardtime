'use strict';

const { DOT_PORTS, matchDohIp, matchDohSni } = require('./doh-dot-patterns');

// Per-signal confidence weights (0-100), same rationale as vpn-patterns.js:
// hand-assigned engineering judgment, not derived from a calibration
// dataset. DoT and a direct hit against a known/operator-verified DoH IP
// are both treated as strong, standalone signals; a plaintext DNS query for
// a known/reputation-listed DoH hostname is slightly weaker (the device
// resolved the name — it doesn't prove the encrypted session that follows
// actually used it); the behavioral heuristic is deliberately the weakest
// signal of the four (see detectBehavioralInterval below).
const DOT_CONFIDENCE = 95;
const DOH_IP_CONFIDENCE = 90;
const DNS_SNI_CONFIDENCE = 80;
const BEHAVIORAL_CONFIDENCE = 20;

// Behavioral heuristic tuning: a device polling one destination on 443 at a
// suspiciously *regular* interval (low variance) resembles a DoH client's
// query/keepalive cadence more than ordinary human browsing, which is
// bursty. This is weak, supplementary, detection-only signal — see the
// doc comment on detectBehavioralInterval for its real limitations.
const BEHAVIORAL_MIN_OBSERVATIONS = 4;
const BEHAVIORAL_MAX_HISTORY = 8;
const BEHAVIORAL_MIN_INTERVAL_MS = 2000;
const BEHAVIORAL_MAX_INTERVAL_MS = 120000;
const BEHAVIORAL_MAX_COEFFICIENT_OF_VARIATION = 0.2;

/**
 * Layer 8: watches each target's TCP conntrack flows for DoT (port 853, any
 * destination — DoT has no other legitimate use), DoH-to-a-known-or-
 * reputation-listed-provider-IP (port 443), a plaintext DNS query for a
 * known/reputation-listed DoH hostname (reuses the same passive DNS sniff
 * infrastructure as VpnDetector, under its own enable flag), and a weak
 * behavioral fallback for devices polling one 443 destination at a
 * suspiciously regular interval. Same shape as VpnDetector (Layer 5)
 * deliberately — detection is unconditional and log/report-only; the
 * actual block happens in firewall.sync()'s ensureDohDotBlock() /
 * addDohDotBlockRules(), independent of whether this class ever runs, and
 * is driven only by the static provider + operator-reputation IP lists —
 * the behavioral heuristic NEVER feeds the firewall, by construction (this
 * class has no reference to any firewall controller).
 */
class DohDetector {
  constructor({ conntrack, dnsSniff, config, metrics, logger, now }) {
    this.conntrack = conntrack;
    // Optional — main.js only wires this in when ENABLE_DOH_DNS_SNIFF is
    // set. Absent, this detector behaves exactly as before DNS-SNI matching
    // was added (no new required constructor arg, no behaviour change).
    this.dnsSniff = dnsSniff || null;
    this.config = config || {};
    this.metrics = metrics;
    this.logger = logger;
    this.now = now || (() => Date.now());
    // deviceId|dst -> timestamps[], for the behavioral heuristic. Bounded
    // (trimmed to BEHAVIORAL_MAX_HISTORY) so a long-lived agent process
    // never accumulates unbounded memory from this.
    this._observations = new Map();
  }

  _recordObservation(deviceId, dst) {
    const key = `${deviceId}|${dst}`;
    const list = this._observations.get(key) || [];
    list.push(this.now());
    while (list.length > BEHAVIORAL_MAX_HISTORY) list.shift();
    this._observations.set(key, list);
  }

  /**
   * Weak, independent supplementary signal: several observed connections
   * from one device to the same destination:443, spaced at a suspiciously
   * *regular* interval (low coefficient of variation). Ordinary browsing
   * produces bursty, human-paced traffic; a client polling a DoH resolver
   * on a fixed schedule (or maintaining a persistent tunnel with periodic
   * keepalives) tends to look more like a metronome. This is NOT a
   * reliable standalone indicator — plenty of legitimate software polls on
   * a fixed interval too (chat apps, telemetry, sync clients) — so it is
   * deliberately weighted low and reported as its own low-confidence
   * detection, never merged into or treated as equivalent to a real
   * provider-IP/SNI match, and it never feeds the firewall block rule.
   */
  detectBehavioralInterval(deviceId, dst) {
    const list = this._observations.get(`${deviceId}|${dst}`) || [];
    if (list.length < BEHAVIORAL_MIN_OBSERVATIONS) return null;

    const intervals = [];
    for (let i = 1; i < list.length; i += 1) intervals.push(list[i] - list[i - 1]);

    const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
    if (mean < BEHAVIORAL_MIN_INTERVAL_MS || mean > BEHAVIORAL_MAX_INTERVAL_MS) return null;

    const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
    const coefficientOfVariation = Math.sqrt(variance) / mean;
    if (coefficientOfVariation > BEHAVIORAL_MAX_COEFFICIENT_OF_VARIATION) return null;

    return {
      method: 'behavioral-interval',
      provider: 'unknown (regular-interval TLS/443)',
      detail: `dst ${dst}, ~${Math.round(mean / 1000)}s interval`,
      confidence: BEHAVIORAL_CONFIDENCE,
    };
  }

  async _detectForTarget(target) {
    const detections = [];
    const matchedDsts443 = new Set();

    const tcpFlows = await this.conntrack.listTcpConnections(target.ipAddress).catch((err) => {
      this.logger.warn('doh-detector: failed to list tcp flows', { deviceId: target.deviceId, error: err.message });
      return [];
    });

    for (const flow of tcpFlows) {
      if (DOT_PORTS.includes(flow.dport)) {
        detections.push({ method: 'conntrack-port-853', provider: 'DoT', detail: String(flow.dport), confidence: DOT_CONFIDENCE });
        continue;
      }
      if (flow.dport !== 443) continue;

      this._recordObservation(target.deviceId, flow.dst);

      const provider = matchDohIp(flow.dst, this.config.dohReputationIps);
      if (provider) {
        detections.push({ method: 'conntrack-doh-ip', provider, detail: flow.dst, confidence: DOH_IP_CONFIDENCE });
        matchedDsts443.add(flow.dst);
      }
    }

    for (const flow of tcpFlows) {
      if (flow.dport !== 443 || matchedDsts443.has(flow.dst)) continue;
      const behavioral = this.detectBehavioralInterval(target.deviceId, flow.dst);
      if (behavioral) {
        detections.push(behavioral);
        matchedDsts443.add(flow.dst);
      }
    }

    if (this.dnsSniff) {
      const queries = await this.dnsSniff.captureDnsQueries(target.ipAddress, {
        enabled: this.config.enableDohDnsSniff,
        sniffMs: this.config.dohDnsSniffMs,
      });
      for (const domain of queries) {
        const match = matchDohSni(domain, this.config.dohReputationDomains);
        if (match) detections.push({ method: 'dns-sni-pattern', provider: match, detail: domain, confidence: DNS_SNI_CONFIDENCE });
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
          confidence: detection.confidence,
        });
        report.push({ deviceId: target.deviceId, ...detection });
      }
    }

    return report;
  }
}

module.exports = { DohDetector };

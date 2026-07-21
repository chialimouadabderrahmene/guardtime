'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// Mirrors tcp-rst-controller.js's SCAPY_RST_PROGRAM technique: a short,
// bounded passive sniff via scapy, invoked as a one-shot subprocess so the
// agent has no permanent Python dependency running.
const SCAPY_DNS_SNIFF_PROGRAM = String.raw`
import json
import sys

try:
    from scapy.all import DNS, DNSQR, sniff, conf
except Exception as exc:
    print(json.dumps({"ok": False, "error": "scapy unavailable: %s" % exc}))
    sys.exit(2)

payload = json.loads(sys.argv[1])
device_ip = payload["deviceIp"]
duration = max(0.1, payload.get("sniffMs", 500) / 1000.0)

conf.verb = 0
queries = []

def capture(pkt):
    if DNS in pkt and pkt[DNS].qr == 0 and DNSQR in pkt:
        try:
            qname = pkt[DNSQR].qname.decode("utf-8", "ignore").rstrip(".").lower()
        except Exception:
            return
        if qname:
            queries.append(qname)

try:
    bpf = "udp port 53 and host %s" % device_ip
    sniff(filter=bpf, timeout=duration, prn=capture, store=False)
    print(json.dumps({"ok": True, "queries": queries}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc), "queries": queries}))
    sys.exit(3)
`;

class DnsSniffController {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Layer 5 "DNS patterns": returns queried domain names, lowercased. Never
   * throws. `options` lets a second caller (doh-detector.js) reuse this same
   * sniff mechanism under its own enable flag/duration
   * (config.enableDohDnsSniff/dohDnsSniffMs) without being tied to the VPN
   * detector's flags — omit `options` entirely for the original VPN-detector
   * behavior (falls back to config.enableVpnDnsSniff/vpnDnsSniffMs).
   */
  async captureDnsQueries(ipAddress, options = {}) {
    const enabled = options.enabled ?? this.config.enableVpnDnsSniff;
    const sniffMs = options.sniffMs ?? this.config.vpnDnsSniffMs;
    if (!enabled || !ipAddress) return [];

    const payload = JSON.stringify({ deviceIp: ipAddress, sniffMs });

    if (this.config.dryRun) {
      this.logger.info('[dry-run] python dns sniff', { ipAddress });
      return [];
    }

    try {
      const result = await execFileAsync(this.config.pythonBin, ['-c', SCAPY_DNS_SNIFF_PROGRAM, payload], {
        timeout: Math.max(3000, sniffMs + 2500),
      });
      const parsed = JSON.parse((result.stdout || '{}').trim() || '{}');
      if (!parsed.ok) {
        this.logger.debug('dns sniff skipped', parsed);
        return [];
      }
      return parsed.queries || [];
    } catch (err) {
      this.logger.debug('dns sniff failed', { ipAddress, error: err.stderr || err.message });
      return [];
    }
  }
}

module.exports = { DnsSniffController };

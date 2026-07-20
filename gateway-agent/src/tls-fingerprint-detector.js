'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

// Real JA3 (https://github.com/salesforce/ja3) computation from a passively
// sniffed TLS ClientHello — same bounded one-shot scapy subprocess pattern
// as dns-sniff-controller.js / tcp-rst-controller.js. Deliberately parses
// the TLS record by hand with struct rather than scapy.layers.tls, which
// pulls in a `cryptography` dependency that may not be installed on a
// minimal router — this needs nothing beyond what tcp-rst-controller.js
// already requires.
const SCAPY_TLS_FINGERPRINT_PROGRAM = String.raw`
import json
import sys
import struct
import hashlib

try:
    from scapy.all import sniff, conf, Raw, TCP
except Exception as exc:
    print(json.dumps({"ok": False, "error": "scapy unavailable: %s" % exc}))
    sys.exit(2)

payload = json.loads(sys.argv[1])
device_ip = payload["deviceIp"]
duration = max(0.1, payload.get("sniffMs", 800) / 1000.0)

conf.verb = 0
# RFC 8701 GREASE values — excluded from the JA3 string per spec, since
# they're randomized per-connection by GREASE-aware clients and would
# otherwise make every fingerprint unique instead of stable per client.
GREASE = {0x0a0a, 0x1a1a, 0x2a2a, 0x3a3a, 0x4a4a, 0x5a5a, 0x6a6a, 0x7a7a,
          0x8a8a, 0x9a9a, 0xaaaa, 0xbaba, 0xcaca, 0xdada, 0xeaea, 0xfafa}

fingerprints = []

def parse_client_hello(data):
    if len(data) < 5 or data[0] != 0x16:
        return None
    record_len = struct.unpack(">H", data[3:5])[0]
    hs = data[5:5 + record_len]
    if len(hs) < 4 or hs[0] != 0x01:
        return None
    hs_len = int.from_bytes(hs[1:4], "big")
    body = hs[4:4 + hs_len]
    if len(body) < 34:
        return None

    pos = 0
    version = struct.unpack(">H", body[pos:pos + 2])[0]
    pos += 2 + 32  # client_version, random
    sid_len = body[pos]
    pos += 1 + sid_len
    cs_len = struct.unpack(">H", body[pos:pos + 2])[0]
    pos += 2
    cipher_suites = [struct.unpack(">H", body[pos + i:pos + i + 2])[0] for i in range(0, cs_len, 2)]
    pos += cs_len
    cm_len = body[pos]
    pos += 1 + cm_len

    extensions, curves, point_formats = [], [], []
    if pos < len(body):
        ext_total_len = struct.unpack(">H", body[pos:pos + 2])[0]
        pos += 2
        end = pos + ext_total_len
        while pos + 4 <= end:
            ext_type = struct.unpack(">H", body[pos:pos + 2])[0]
            ext_len = struct.unpack(">H", body[pos + 2:pos + 4])[0]
            ext_data = body[pos + 4:pos + 4 + ext_len]
            extensions.append(ext_type)
            if ext_type == 0x000a and len(ext_data) >= 2:  # supported_groups
                list_len = struct.unpack(">H", ext_data[0:2])[0]
                curves = [struct.unpack(">H", ext_data[2 + i:4 + i])[0] for i in range(0, list_len, 2)]
            if ext_type == 0x000b and len(ext_data) >= 1:  # ec_point_formats
                fmt_len = ext_data[0]
                point_formats = list(ext_data[1:1 + fmt_len])
            pos += 4 + ext_len

    def strip_grease(values):
        return [v for v in values if v not in GREASE]

    ja3 = "%d,%s,%s,%s,%s" % (
        version,
        "-".join(str(v) for v in strip_grease(cipher_suites)),
        "-".join(str(v) for v in strip_grease(extensions)),
        "-".join(str(v) for v in strip_grease(curves)),
        "-".join(str(v) for v in point_formats),
    )
    return hashlib.md5(ja3.encode()).hexdigest()

def capture(pkt):
    if TCP in pkt and Raw in pkt:
        fp = parse_client_hello(bytes(pkt[Raw]))
        if fp:
            fingerprints.append(fp)

try:
    bpf = "tcp port 443 and host %s" % device_ip
    sniff(filter=bpf, timeout=duration, prn=capture, store=False)
    print(json.dumps({"ok": True, "fingerprints": fingerprints}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc), "fingerprints": fingerprints}))
    sys.exit(3)
`;

class TlsFingerprintDetector {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  /** Returns the list of JA3 hashes seen in this device's TLS handshakes during the sniff window. Never throws. */
  async captureFingerprints(ipAddress) {
    if (!this.config.enableTlsFingerprint || !ipAddress) return [];

    const payload = JSON.stringify({ deviceIp: ipAddress, sniffMs: this.config.tlsFingerprintSniffMs });

    if (this.config.dryRun) {
      this.logger.info('[dry-run] python tls fingerprint sniff', { ipAddress });
      return [];
    }

    try {
      const result = await execFileAsync(this.config.pythonBin, ['-c', SCAPY_TLS_FINGERPRINT_PROGRAM, payload], {
        timeout: Math.max(3000, this.config.tlsFingerprintSniffMs + 2500),
      });
      const parsed = JSON.parse((result.stdout || '{}').trim() || '{}');
      if (!parsed.ok) {
        this.logger.debug('tls fingerprint sniff skipped', parsed);
        return [];
      }
      return parsed.fingerprints || [];
    } catch (err) {
      this.logger.debug('tls fingerprint sniff failed', { ipAddress, error: err.stderr || err.message });
      return [];
    }
  }

  /**
   * Matches captured JA3 hashes against the operator-supplied denylist
   * (config.tlsVpnJa3Hashes, from TLS_VPN_JA3_HASHES env). Empty by
   * default — deliberately shipped with NO hardcoded "known VPN client"
   * hashes, because verifying that a specific JA3 hash genuinely
   * corresponds to a specific VPN/proxy client requires either a licensed
   * threat-intel feed or hands-on lab capture against that exact client,
   * neither of which is available in this environment. Fabricating
   * plausible-looking hash constants here would be worse than shipping
   * nothing — a wrong hash either misses real VPN traffic (false
   * confidence) or flags innocent devices (false accusation). An operator
   * who has verified real hashes (e.g. from their own lab capture, or a
   * threat-intel subscription) can populate this list without a code
   * change.
   */
  matchKnownSignature(ja3Hash) {
    const list = this.config.tlsVpnJa3Hashes || [];
    return list.includes(ja3Hash) ? ja3Hash : null;
  }

  async detectForTarget(target) {
    const fingerprints = await this.captureFingerprints(target.ipAddress);
    const detections = [];
    for (const fp of fingerprints) {
      if (this.matchKnownSignature(fp)) {
        detections.push({ method: 'tls-ja3-signature', provider: 'unknown-vpn-or-proxy', detail: fp });
      }
    }
    return detections;
  }
}

module.exports = { TlsFingerprintDetector };

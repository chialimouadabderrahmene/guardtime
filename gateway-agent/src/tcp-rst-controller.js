'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const SCAPY_RST_PROGRAM = String.raw`
import json
import sys
import time

try:
    from scapy.all import IP, TCP, Raw, send, sniff, conf
except Exception as exc:
    print(json.dumps({"ok": False, "error": "scapy unavailable: %s" % exc}))
    sys.exit(2)

payload = json.loads(sys.argv[1])
device_ip = payload["deviceIp"]
duration = max(0.1, payload.get("sniffMs", 700) / 1000.0)
flows = payload.get("flows", [])
flow_keys = set()
for flow in flows:
    flow_keys.add((flow["src"], int(flow["sport"]), flow["dst"], int(flow["dport"])))
    flow_keys.add((flow["dst"], int(flow["dport"]), flow["src"], int(flow["sport"])))

sent = 0
conf.verb = 0

def tcp_len(pkt):
    if Raw in pkt:
        return len(bytes(pkt[Raw]))
    flags = int(pkt[TCP].flags)
    return 1 if flags & 0x03 else 0

def send_rst_pair(pkt):
    global sent
    ip = pkt[IP]
    tcp = pkt[TCP]
    key = (ip.src, int(tcp.sport), ip.dst, int(tcp.dport))
    if flow_keys and key not in flow_keys:
        return

    next_seq = int(tcp.seq) + tcp_len(pkt)
    packets = [
        IP(src=ip.src, dst=ip.dst) / TCP(sport=tcp.sport, dport=tcp.dport, flags="R", seq=next_seq),
    ]
    if "A" in tcp.flags:
        packets.append(
            IP(src=ip.dst, dst=ip.src) / TCP(sport=tcp.dport, dport=tcp.sport, flags="R", seq=int(tcp.ack))
        )
    send(packets, verbose=False)
    sent += len(packets)

try:
    bpf = "tcp and host %s" % device_ip
    sniff(filter=bpf, timeout=duration, prn=send_rst_pair, store=False)
    print(json.dumps({"ok": True, "rstPacketsSent": sent}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": str(exc), "rstPacketsSent": sent}))
    sys.exit(3)
`;

class TcpRstController {
  constructor(config, logger, conntrack) {
    this.config = config;
    this.logger = logger;
    this.conntrack = conntrack;
  }

  async killDevice(ipAddress, knownFlows) {
    if (!this.config.enableTcpRst || !ipAddress) return;

    const flows = knownFlows || await this.conntrack.listTcpConnections(ipAddress).catch((err) => {
      this.logger.warn('tcp rst conntrack flow listing failed', { ipAddress, error: err.message });
      return [];
    });

    await this.injectResets(ipAddress, flows);
  }

  async injectResets(ipAddress, flows) {
    const payload = JSON.stringify({
      deviceIp: ipAddress,
      sniffMs: this.config.tcpRstSniffMs,
      flows,
    });

    if (this.config.dryRun) {
      this.logger.info('[dry-run] python tcp rst injection', { ipAddress, flows: flows.length });
      return;
    }

    try {
      const result = await execFileAsync(this.config.pythonBin, ['-c', SCAPY_RST_PROGRAM, payload], {
        timeout: Math.max(3000, this.config.tcpRstSniffMs + 2500),
      });
      const parsed = JSON.parse((result.stdout || '{}').trim() || '{}');
      if (!parsed.ok) {
        this.logger.warn('tcp rst injection skipped', parsed);
      } else {
        this.logger.info('tcp rst injection complete', { ipAddress, rstPacketsSent: parsed.rstPacketsSent });
      }
    } catch (err) {
      this.logger.warn('tcp rst injection failed', { ipAddress, error: err.stderr || err.message });
    }
  }
}

module.exports = { TcpRstController };

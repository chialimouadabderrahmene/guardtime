'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * In-memory metrics for gateway-agent enforcement actions (Layer 3 "metrics"
 * requirement). No external dependency — counters are logged every sync cycle
 * by main.js and are directly inspectable in tests. Intentionally simple: this
 * agent runs unattended on a router, so metrics must never require a network
 * call or extra service to be useful.
 */
class Metrics {
  constructor() {
    this.counters = Object.create(null);
    // Cumulative, never reset by flush() — Prometheus counters must only
    // ever go up (except on process restart); `counters`/flush() above
    // exist for the per-cycle log line and are a separate concern.
    this.totals = Object.create(null);
  }

  inc(name, by = 1) {
    this.counters[name] = (this.counters[name] || 0) + by;
    this.totals[name] = (this.totals[name] || 0) + by;
  }

  /** Returns a shallow copy of all counters and resets them to zero. */
  flush() {
    const snapshot = { ...this.counters };
    this.counters = Object.create(null);
    return snapshot;
  }

  snapshot() {
    return { ...this.counters };
  }

  /**
   * Writes cumulative counters in Prometheus text-exposition format to a
   * file, for node_exporter's textfile collector (or any scraper that reads
   * a file instead of an HTTP endpoint) to pick up. No HTTP server here —
   * this agent runs with elevated network privileges on a router, and an
   * extra listening port is attack surface this design deliberately avoids
   * (same reasoning as healthcheck.js using a heartbeat file, not a port).
   *
   * Written atomically (temp file + rename) so a scraper never reads a
   * half-written file mid-update.
   */
  writeTextfile(filePath) {
    const lines = [
      '# HELP guardtime_gateway_agent_actions_total Cumulative count of enforcement actions taken, by counter name.',
      '# TYPE guardtime_gateway_agent_actions_total counter',
    ];
    for (const [name, value] of Object.entries(this.totals)) {
      lines.push(`guardtime_gateway_agent_actions_total{name="${name}"} ${value}`);
    }
    lines.push('');

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.tmp`);
    fs.writeFileSync(tmpPath, lines.join(os.EOL));
    fs.renameSync(tmpPath, filePath); // rename is atomic on the same filesystem
  }
}

module.exports = { Metrics };

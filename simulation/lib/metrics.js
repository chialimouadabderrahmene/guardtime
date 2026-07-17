'use strict';

// Lightweight latency + counter collection. Real numbers only.
class Metrics {
  constructor() {
    this.latencies = []; // ms
    this.counters = {};
    this.statusCounts = {};
  }

  record(ms, status) {
    this.latencies.push(ms);
    this.statusCounts[status] = (this.statusCounts[status] || 0) + 1;
  }

  inc(name, by = 1) {
    this.counters[name] = (this.counters[name] || 0) + by;
  }

  percentile(p) {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Math.round(sorted[idx]);
  }

  summary() {
    const n = this.latencies.length;
    const avg = n ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / n) : 0;
    return {
      requests: n,
      avgMs: avg,
      p50Ms: this.percentile(50),
      p95Ms: this.percentile(95),
      maxMs: n ? Math.round(Math.max(...this.latencies)) : 0,
      statusCounts: this.statusCounts,
      counters: this.counters,
    };
  }
}

// Snapshot of THIS Node process resource use (the simulator's own cost).
function processResources() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    rssMB: +(mem.rss / 1048576).toFixed(1),
    heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
  };
}

module.exports = { Metrics, processResources };

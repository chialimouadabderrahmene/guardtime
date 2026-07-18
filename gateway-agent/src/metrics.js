'use strict';

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
  }

  inc(name, by = 1) {
    this.counters[name] = (this.counters[name] || 0) + by;
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
}

module.exports = { Metrics };

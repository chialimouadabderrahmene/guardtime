'use strict';

// Client-side network chaos. Injects latency, timeouts, and packet loss into an
// ApiClient (via its `chaos` hook) to test how clients/simulators behave under
// adverse networks. NOTE: this simulates the *client's* network conditions — it
// does NOT crash the real server (that requires host access / staging).
class NetworkSimulator {
  constructor() {
    this.extraLatencyMs = 0;
    this.dropRate = 0; // 0..1 — fraction of requests that "time out"
    this.enabled = false;
  }

  hook() {
    return async () => {
      if (!this.enabled) return;
      if (this.dropRate > 0 && Math.random() < this.dropRate) {
        // Simulate a dropped packet / connection timeout on the client side.
        const e = new Error('AbortError');
        e.name = 'AbortError';
        throw e;
      }
      if (this.extraLatencyMs > 0) {
        await new Promise((res) => setTimeout(res, this.extraLatencyMs));
      }
    };
  }

  highLatency(ms) {
    this.enabled = true;
    this.extraLatencyMs = ms;
  }
  packetLoss(rate) {
    this.enabled = true;
    this.dropRate = rate;
  }
  reset() {
    this.enabled = false;
    this.extraLatencyMs = 0;
    this.dropRate = 0;
  }
}

module.exports = { NetworkSimulator };

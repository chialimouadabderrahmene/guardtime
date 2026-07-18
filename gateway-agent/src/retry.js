'use strict';

/**
 * Safe retry-with-backoff for enforcement actions (Layer 3 requirement).
 * Used by firewall/conntrack/tcp-rst/qos controllers so a single transient
 * failure (e.g. a momentary `nft`/`iptables` lock contention) doesn't abandon
 * an enforcement action outright.
 */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {() => Promise<T>} fn
 * @param {{ attempts?: number, delayMs?: number, onRetry?: (err: Error, attempt: number) => void }} opts
 * @returns {Promise<T>}
 */
async function retry(fn, opts = {}) {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 200;
  let lastErr;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < attempts) {
        if (opts.onRetry) opts.onRetry(err, attempt);
        await sleep(delayMs * attempt); // linear backoff
      }
    }
  }
  throw lastErr;
}

module.exports = { retry, sleep };

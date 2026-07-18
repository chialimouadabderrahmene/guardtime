'use strict';

const dns = require('node:dns/promises');

/**
 * Resolves a list of domains to IPv4 addresses with a TTL cache, so Layer 7
 * category-based bandwidth shaping doesn't re-resolve the same domains on
 * every ~3s poll cycle. Best-effort: a domain that fails to resolve is
 * skipped (or served from stale cache if available) rather than aborting
 * the whole batch.
 */
class DnsResolveCache {
  constructor({ ttlMs = 5 * 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  async resolveAll(domains, logger) {
    const results = new Set();
    const now = Date.now();

    await Promise.all(
      domains.map(async (domain) => {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > now) {
          cached.ips.forEach((ip) => results.add(ip));
          return;
        }

        try {
          const ips = await dns.resolve4(domain);
          this.cache.set(domain, { ips, expiresAt: now + this.ttlMs });
          ips.forEach((ip) => results.add(ip));
        } catch (err) {
          logger.debug('bandwidth: dns resolve failed for category domain', { domain, error: err.message });
          if (cached) cached.ips.forEach((ip) => results.add(ip));
        }
      }),
    );

    return [...results];
  }
}

module.exports = { DnsResolveCache };

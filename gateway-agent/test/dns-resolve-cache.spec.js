'use strict';

jest.mock('node:dns/promises', () => ({ resolve4: jest.fn() }));
const dns = require('node:dns/promises');

const { DnsResolveCache } = require('../src/dns-resolve-cache');

function fakeLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('DnsResolveCache.resolveAll', () => {
  beforeEach(() => {
    dns.resolve4.mockReset();
  });

  it('resolves each domain and returns the deduplicated union of IPs', async () => {
    dns.resolve4.mockImplementation((domain) => {
      if (domain === 'youtube.com') return Promise.resolve(['1.1.1.1', '1.1.1.2']);
      if (domain === 'googlevideo.com') return Promise.resolve(['1.1.1.2', '1.1.1.3']);
      return Promise.reject(new Error('unexpected domain'));
    });
    const cache = new DnsResolveCache();

    const ips = await cache.resolveAll(['youtube.com', 'googlevideo.com'], fakeLogger());

    expect(new Set(ips)).toEqual(new Set(['1.1.1.1', '1.1.1.2', '1.1.1.3']));
  });

  it('serves from cache within the TTL without re-resolving', async () => {
    dns.resolve4.mockResolvedValue(['1.1.1.1']);
    const cache = new DnsResolveCache({ ttlMs: 60000 });

    await cache.resolveAll(['youtube.com'], fakeLogger());
    await cache.resolveAll(['youtube.com'], fakeLogger());

    expect(dns.resolve4).toHaveBeenCalledTimes(1);
  });

  it('re-resolves once the TTL has expired', async () => {
    dns.resolve4.mockResolvedValue(['1.1.1.1']);
    const cache = new DnsResolveCache({ ttlMs: -1 }); // already expired immediately

    await cache.resolveAll(['youtube.com'], fakeLogger());
    await cache.resolveAll(['youtube.com'], fakeLogger());

    expect(dns.resolve4).toHaveBeenCalledTimes(2);
  });

  it('serves stale cached IPs when a re-resolve fails, instead of dropping the domain', async () => {
    const cache = new DnsResolveCache({ ttlMs: -1 });
    dns.resolve4.mockResolvedValueOnce(['1.1.1.1']);
    await cache.resolveAll(['youtube.com'], fakeLogger());

    dns.resolve4.mockRejectedValueOnce(new Error('NXDOMAIN'));
    const ips = await cache.resolveAll(['youtube.com'], fakeLogger());

    expect(ips).toEqual(['1.1.1.1']);
  });

  it('skips a domain entirely (no throw) when it has never resolved and fails', async () => {
    dns.resolve4.mockRejectedValue(new Error('NXDOMAIN'));
    const logger = fakeLogger();
    const cache = new DnsResolveCache();

    const ips = await cache.resolveAll(['nonexistent.example'], logger);

    expect(ips).toEqual([]);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('returns an empty array for an empty domain list', async () => {
    const cache = new DnsResolveCache();
    expect(await cache.resolveAll([], fakeLogger())).toEqual([]);
    expect(dns.resolve4).not.toHaveBeenCalled();
  });
});

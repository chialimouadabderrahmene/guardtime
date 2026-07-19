/**
 * GuardTime fleet load test — simulates a realistic mix of DNS policy
 * checks and gateway polling at a chosen device-count tier.
 *
 * Traffic model (documented assumptions, not measured production data —
 * calibrate these against real numbers once you have them):
 *   - devices : families = 10 : 1 (matches the stated 10,000 devices /
 *     1,000 families target)
 *   - families : gateways = 1 : 1 (one gateway per household)
 *   - each gateway polls GET /gateway/policies every POLL_INTERVAL_MS,
 *     3000ms by default — this is gateway-agent's actual default
 *     (gateway-agent/src/config.js), not a guess
 *   - each device issues a DNS policy check roughly every
 *     DNS_QUERY_INTERVAL_S seconds while "active" — modeled, not measured
 *   - ACTIVE_FRACTION of devices are actively generating DNS traffic at
 *     any given moment (the rest are idle/offline) — modeled, not measured
 *
 * SAFETY (same convention as simulation/config.js): refuses to run any
 * tier above the smallest against a target that looks like production,
 * unless LOAD_ALLOW_PROD=1 is explicitly set. Don't set that against
 * api.waqti.pro.
 *
 * Usage:
 *   k6 run -e BASE_URL=https://staging.example.com -e DEVICE_TIER=1000 fleet-load.js
 *
 * DEVICE_TIER: one of 100, 500, 1000, 5000, 10000 (default 100)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const DEVICE_TIER = parseInt(__ENV.DEVICE_TIER || '100', 10);
const ALLOW_PROD = __ENV.LOAD_ALLOW_PROD === '1';

const LOOKS_LIKE_PROD = /waqti\.pro/i.test(BASE_URL);
if (LOOKS_LIKE_PROD && !ALLOW_PROD && DEVICE_TIER > 10) {
  throw new Error(
    `Refusing to run a ${DEVICE_TIER}-device load tier against what looks like production ` +
      `(${BASE_URL}). Point this at a staging environment, or set LOAD_ALLOW_PROD=1 if you ` +
      `are absolutely certain this target is not production (not recommended).`,
  );
}

const DEVICES_PER_FAMILY = 10;
const FAMILY_COUNT = Math.ceil(DEVICE_TIER / DEVICES_PER_FAMILY);
const GATEWAY_COUNT = FAMILY_COUNT; // one gateway per family
const ACTIVE_FRACTION = 0.3; // modeled: ~30% of devices generating DNS traffic at any moment
const DNS_QUERY_INTERVAL_S = 5; // modeled: an active device queries roughly every 5s
const POLL_INTERVAL_MS = 3000; // real default, gateway-agent/src/config.js

// Custom metrics, split by traffic class so a slow gateway poll doesn't
// hide inside an otherwise-fast DNS check average, or vice versa.
const dnsCheckDuration = new Trend('dns_policy_check_duration', true);
const gatewayPollDuration = new Trend('gateway_poll_duration', true);
const dnsFailures = new Counter('dns_policy_check_failures');
const gatewayFailures = new Counter('gateway_poll_failures');
const dnsTimeouts = new Counter('dns_policy_check_timeouts');
const errorRate = new Rate('error_rate');

const TEST_DOMAINS = [
  'youtube.com', 'roblox.com', 'google.com', 'netflix.com', 'discord.com',
  'tiktok.com', 'instagram.com', 'minecraft.net', 'twitch.tv', 'reddit.com',
];

export const options = {
  scenarios: {
    dns_checks: {
      executor: 'constant-vus',
      vus: Math.max(1, Math.ceil(DEVICE_TIER * ACTIVE_FRACTION)),
      duration: __ENV.DURATION || '2m',
      exec: 'dnsCheck',
    },
    gateway_polls: {
      executor: 'constant-vus',
      vus: Math.max(1, GATEWAY_COUNT),
      duration: __ENV.DURATION || '2m',
      exec: 'gatewayPoll',
      startTime: '2s', // stagger so both scenarios don't spike at t=0 together
    },
  },
  thresholds: {
    // SLO targets — tune once you have a real baseline. Failing a threshold
    // fails the k6 run's exit code, so CI can gate on it.
    dns_policy_check_duration: ['p(95)<200', 'p(99)<500'],
    gateway_poll_duration: ['p(95)<300'],
    error_rate: ['rate<0.01'], // <1% failure rate
    http_req_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function randomIp() {
  return `10.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
}

export function dnsCheck() {
  const domain = TEST_DOMAINS[Math.floor(Math.random() * TEST_DOMAINS.length)];
  const sourceIp = randomIp();

  const res = http.get(
    `${BASE_URL}/dns/policy/check?sourceIp=${sourceIp}&domain=${domain}`,
    { timeout: '2s', tags: { name: 'dns_policy_check' } },
  );

  dnsCheckDuration.add(res.timings.duration);
  const ok = check(res, {
    'dns check status is 200': (r) => r.status === 200,
    'dns check returns an action': (r) => {
      try { return !!JSON.parse(r.body).action; } catch { return false; }
    },
  });
  errorRate.add(!ok);
  if (!ok) dnsFailures.add(1);
  if (res.status === 0) dnsTimeouts.add(1); // k6 reports status 0 on timeout/network error

  sleep(DNS_QUERY_INTERVAL_S * (0.5 + Math.random())); // jitter around the modeled interval
}

export function gatewayPoll() {
  // Unauthenticated placeholder token — a real run against staging needs a
  // seeded, valid gateway token. See README.md "Seeding test data."
  const token = __ENV.GATEWAY_TOKEN || 'load-test-invalid-token';

  const res = http.get(`${BASE_URL}/gateway/policies`, {
    headers: { 'x-gateway-token': token },
    timeout: '3s',
    tags: { name: 'gateway_poll' },
  });

  gatewayPollDuration.add(res.timings.duration);
  const ok = check(res, {
    // Without a seeded valid token this legitimately 401s — that's still a
    // useful latency measurement of the auth-rejection path. See README.
    'gateway poll gets a response (200 or 401)': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  if (!ok) gatewayFailures.add(1);

  sleep(POLL_INTERVAL_MS / 1000);
}

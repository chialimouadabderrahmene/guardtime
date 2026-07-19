/**
 * Mechanical smoke test — proves the k6 toolchain + this repo's scripts
 * actually execute end-to-end against a real running service. Not a load
 * test (trivial VU count, short duration) — just verification that the
 * harness works, run against a fully local target with zero external/prod
 * contact.
 *
 * Usage: k6 run -e BASE_URL=http://127.0.0.1:8080 smoke-local.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

export const options = {
  vus: 3,
  iterations: 15,
};

export default function () {
  const res = http.get(`${BASE_URL}/health`, { timeout: '2s' });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body reports ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
    },
  });
  sleep(0.2);
}

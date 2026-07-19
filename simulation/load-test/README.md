# GuardTime Load Testing Suite

Built with [k6](https://k6.io) (`k6.exe` confirmed installed on the machine
this was authored on — `k6 version` → v2.0.0). Complements the existing
`simulation/` lab (functional/E2E correctness) — this suite is about
**volume**, not correctness.

## What's here

`k6/fleet-load.js` — simulates the two dominant traffic classes at a chosen
device-count tier:
- **DNS policy checks** (`GET /dns/policy/check`) — the hottest path in the
  whole system; every DNS lookup from every device hits this.
- **Gateway polling** (`GET /gateway/policies`) — every paired gateway polls
  this every 3s by default (gateway-agent's real default, not a guess).

Device:family:gateway ratios and per-device query rate are **modeled
assumptions**, documented at the top of the script — this repo has no
recorded production traffic to calibrate against. Update the constants
there once you have real numbers.

## Tiers

```
k6 run -e BASE_URL=<staging-url> -e DEVICE_TIER=100   k6/fleet-load.js
k6 run -e BASE_URL=<staging-url> -e DEVICE_TIER=500   k6/fleet-load.js
k6 run -e BASE_URL=<staging-url> -e DEVICE_TIER=1000  k6/fleet-load.js
k6 run -e BASE_URL=<staging-url> -e DEVICE_TIER=5000  k6/fleet-load.js
k6 run -e BASE_URL=<staging-url> -e DEVICE_TIER=10000 k6/fleet-load.js
```

Add `-e DURATION=10m` for a longer soak (default 2m — long enough to see
p95/p99 settle, short enough for a quick smoke run). Save results:

```
k6 run --summary-export=results-1000.json -e DEVICE_TIER=1000 ... k6/fleet-load.js
```

## Safety — read this before running anything

The script hard-refuses any tier above 10 devices against a `BASE_URL` that
looks like production (`*.waqti.pro`) unless you set `LOAD_ALLOW_PROD=1` —
same convention `simulation/config.js` already uses for the existing lab,
reused deliberately rather than inventing a second safety mechanism.
**Do not set that flag against real production.** A 10,000-device DNS-check
tier is, by design, enough sustained request volume to degrade or take down
a shared backend — that's the whole point of running it, which is exactly
why it belongs on a target nobody's family depends on.

## What this suite measures, and what it can't

k6 gives you, from the client side: request latency (the DNS/gateway Trend
metrics above, plus k6's built-in `http_req_duration`), failure rate,
timeout count, and — since each VU sleeps and retries the same way a real
device/gateway would on failure — an implicit retry-rate signal.

It **cannot** see server-side CPU, RAM, disk I/O, Postgres/Redis connection
counts, BullMQ queue depth, or memory leaks over a long soak — those live on
the server, not in the load generator. Watch them via the backend's
`/metrics` Prometheus endpoint (added in the previous hardening pass) during
the same run — e.g. `guardtime_backend_process_resident_memory_bytes` for
RAM, `guardtime_backend_process_cpu_seconds_total` for CPU. A slow memory
leak specifically needs a **long** soak (hours, not the 2-minute default
here) with that metric graphed over time — a short load-test run cannot
surface one, regardless of tooling.

## Seeding test data

`gatewayPoll()` needs a real, paired gateway token to get a 200 instead of
401 — pass one via `-e GATEWAY_TOKEN=<token>` seeded on your staging
database beforehand (see `simulation/scenario-runner` for how the existing
lab seeds test parents/children/devices/gateways; the same approach applies
here, just at higher volume). Without a real token, the gateway-poll
scenario still measures the auth-rejection path's latency — a legitimate
number, just not the one you actually care about.

## Status of this suite as of this audit

**Built and verified to execute correctly (see below). Not run at any load
tier against a real backend** — no staging environment or local Postgres/
Redis stack was available in this sandbox (no Docker, no WSL distro, no
local Postgres install — same constraint noted in the prior hardening
report). Running the actual 100→10,000 tiers and producing real performance
numbers is the next concrete step once a staging target exists.

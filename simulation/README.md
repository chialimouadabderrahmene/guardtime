# GuardTime Simulation Lab

Node-only integration/QA harness that drives the **real** backend (no Docker,
VMs, emulators, or devices). Each simulator is independent and every PASS comes
from a real executed assertion against the API.

## Layout
```
simulation/
  config.js                 target URL, safety caps, load tiers
  lib/                      api client (+chaos hook), metrics, scenario recorder
  child-simulator/          simulated child device (DNS, sessions, lock, heartbeat)
  gateway-simulator/        simulated gateway agent (register/pair/poll/discovery)
  network-simulator/        client-side chaos (latency, packet loss)
  scenario-runner/run.js    orchestrates all scenarios + load + chaos, writes report
  report-generator/         simulation-report.md + .json
```

## Run
```bash
cd simulation
node scenario-runner/run.js            # defaults to https://api.waqti.pro (prod safe-mode)
```
Prod safe-mode: heavy load tiers (50–1000) and server-side chaos are **disabled**
so the lab never DoSes or corrupts production. It creates a throwaway parent
account, exercises it, and deletes it at the end.

### Full load + chaos (local/staging only)
Requires a local backend with Postgres + Redis running (not available on a bare
Windows box without those services). Then:
```bash
SIM_BASE_URL=http://localhost:3000 SIM_ALLOW_HEAVY=1 node scenario-runner/run.js
```

## What it verifies (real)
Auth (login/register/refresh/logout/roles/invalid/replay), DB CRUD + IDOR, DNS
(allow/block/wildcard/category/lock), child-device (heartbeat/session/reconnect),
gateway (register/pair/poll/discovery/auth), notifications list, reports,
security (SQLi, replay, rate-limit, DNS-spam throttle behaviour), and
client-side network chaos.

## What it cannot verify here (marked NOT_EXECUTED, not faked)
- Server-side chaos (crash Redis/DB/backend, PM2 restart) — needs host/SSH or a
  local stack; destructive on prod.
- Heavy load (50–1000 devices) against prod — throttled + would pollute prod.
- Scheduler cron (bedtime/expiry/cleanup) — server-side timers; covered by unit tests.
- FCM push delivery — credential-gated (no Firebase service account).

## Bugs found by this lab
- **Refresh-token replay** (fixed): the same refresh token was accepted twice
  (200/200). Root cause: non-atomic read-then-write rotation. Fixed with a
  compare-and-swap `updateMany`. See backend `auth.service.ts` + tests.
- **DNS endpoint throttled** (fix committed, deploy-pending): `/dns/policy/check`
  returns 429 under volume → resolver fails open. `@SkipThrottle()` fixes it.

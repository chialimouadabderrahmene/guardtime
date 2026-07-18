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
  gateway-simulator/        simulated gateway agent (register/pair/poll/discovery, over HTTP)
  gateway-agent-simulator/  drives the REAL gateway-agent modules in dry-run (Layers 3-7)
  network-simulator/        client-side chaos (latency, packet loss)
  scenario-runner/run.js    orchestrates all scenarios + load + chaos, writes report
  report-generator/         simulation-report.md + .json
```

### gateway-agent-simulator (Layers 3-7 security hardening)
`gateway-simulator/` plays the *backend-facing* side of a router (register,
pair, poll `/gateway/policies`, report `/gateway/discovery`) over plain HTTP —
it never touches the actual Linux-only enforcement code. gateway-agent itself
is a standalone daemon meant to run on a customer's router; it can't be driven
that way inside this Windows-only lab.

`gateway-agent-simulator/run-dry-cycle.js` instead requires the **real**
gateway-agent source modules (`ConnectionKiller`, `IptablesController`,
`QosController`, `VpnDetector`, etc.) directly and runs one full `syncOnce()`
cycle with `dryRun: true` against a realistic 4-device policy payload — a
BLOCK+VPN+QUIC device, a bandwidth-throttled device, a category-bandwidth-
capped device, and an adversarial device whose IP collides with the gateway's
own management IP. It proves the whole L3-L7 pipeline wires together and
runs without throwing, and specifically that the management-guard's
protection now covers every enforcement stage (firewall, qos, connection-
killer), not just connection-killer alone — a gap this exact test caught
and the fix (`main.js` now filters targets through `managementGuard` once,
upstream of all stages) closed.

What it does **not** prove: that `iptables`/`tc`/`conntrack`/`nft` behave
correctly on a real kernel — `dryRun` skips actually invoking them. That is
covered by gateway-agent's own Jest suite (144 tests), which mocks
`execFile` and asserts the exact command arguments on every platform.

The scenario runner also exercises the new backend endpoints/fields (Layer 4
discovery fingerprint fields, Layer 5 `vpnBlockEnabled` + `/gateway/vpn-
detections`, Layer 6 `quicBlockEnabled`, Layer 7 `/bandwidth-limits` CRUD)
directly against whatever `SIM_BASE_URL` is configured. Since this hardening
pass had not been deployed to production at the time this lab last ran, those
scenarios honestly report **WARN** ("not yet deployed") rather than a fake
PASS — the same convention already used for the pre-existing SkipThrottle
scenario. Re-run after deployment to turn them into real PASSes.

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
gateway (register/pair/poll/discovery/auth), gateway-agent Layers 3-7 (connection-
killer + firewall + VPN detection + QUIC block + bandwidth control, dry-run
end-to-end), notifications list, reports, security (SQLi, replay, rate-limit,
DNS-spam throttle behaviour), and client-side network chaos.

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
- **Management-guard gap** (fixed): the Layer 3 `ManagementGuard` only
  filtered targets inside `ConnectionKiller` (the active-termination path).
  A device record whose IP collided with the gateway's own management IP
  would still get a persistent firewall DROP rule, QoS throttle, and VPN/QUIC
  block installed against it. Fixed by filtering the whole target list
  through `managementGuard.filterTargets()` once in `main.js`'s `syncOnce()`,
  upstream of every enforcement stage. Caught by the gateway-agent-simulator's
  adversarial test device before this shipped. See gateway-agent `main.js` +
  `test/main.spec.js`.

# GuardTime — Production Readiness Report

- **Date:** 2026-07-17
- **Backend HEAD:** `36c4e4d` · **Deployed:** `f71edfc` (pre this round's fixes)
- **Backend tests:** 8 suites, **53 tests, all green**
- **Production readiness score: 78 / 100** (evidence-only)

Every conclusion below is backed by an executed test or a live call. Nothing is
marked PASS by assumption. Items that could not be run in this environment are
marked NOT_EXECUTED with the reason — not faked.

---

## 1. DNS endpoint throttling — FIXED (deploy-pending)
**Root cause (why the previous fix failed):** `@SkipThrottle()` with no argument
skips only the throttler named `default`. `ThrottlerModule.forRoot` also
registers `auth_login` (5/60) and `auth_register` (10/60), and per the
`ThrottlerGuard` source **every configured throttler applies to every route**.
So the DNS endpoint stayed capped at **5 requests/min** by `auth_login` → 429 →
resolver fails open.

**Fix:** `@SkipThrottle({ default: true, auth_login: true, auth_register: true })`
on `DnsPolicyController`. Normal endpoints keep the global limiter.

**Evidence:** `test/dns-policy.throttle.spec.ts` rebuilt with the **real 3-throttler
production config** (the old single-throttler test is why this slipped through):
- 500 rapid calls to `/dns/policy/check` → **never throttled** ✓
- a normal route → **throttled after the limit** ✓

**Cannot show live PASS from here:** the running server is `f71edfc` (pre-fix).
After you deploy `36c4e4d`, the Simulation Lab's "DNS spam" WARN becomes PASS.

**Security note:** `/dns/policy/check` is unauthenticated and now unthrottled →
**restrict it to localhost/trusted network at Nginx** (it is only ever called by
the co-located DNS service). Without that, it is DoS-exposed.

## 2. Previously NOT_EXECUTED — now automated (no waiting)
| Item | Result | Evidence |
|---|---|---|
| Expired gaming session | **PASS** | `scheduler.spec` — `calculateRemainingMinutes`, 3h-ago start → 0 |
| Scheduler bedtime | **PASS** | `scheduler.spec` — `enforceDeviceSchedules` locks in-window, unlocks after, no-op outside (fake timers) |
| Scheduler gaming expiry | **PARTIAL** | remaining-time detection tested; full `checkActiveSessions` cron path not driven |
| Scheduler cache cleanup | **NOT_IMPLEMENTED** | no cache-cleanup cron exists in the code — nothing to test |
| TTL cache expiry | **PARTIAL** | 30s TTL is cache-manager's job; version-invalidation is tested in `dns-policy.engine`; raw TTL expiry not asserted |

## 3. Firebase Push — PARTIAL
No Firebase credentials → real delivery not run. `push.service.spec` covers the
integration with a mocked sender: **register/upsert, send, prune invalid token,
no-tokens (offline device), delivery-disabled no-op**. **Retry is not implemented**
in `PushService`, so it is not tested (adding it would be a new feature — out of
scope for this task).

## 4. Load testing (100 / 500 / 1000) — NOT_EXECUTED
Requires a local/staging backend with Postgres + Redis. **None available on this
Windows host and Docker is disallowed**; running it against production would DoS
and pollute prod. Harness is built and gated: `SIM_BASE_URL=<staging>
SIM_ALLOW_HEAVY=1 node scenario-runner/run.js`.

## 5. Chaos testing — PARTIAL
- **Client-side (PASS):** high latency (+1200ms handled), 100% packet loss
  (aborted cleanly), unreachable backend (handled without crash).
- **Server-side (NOT_EXECUTED):** crash Redis/DB/backend + PM2 restart need
  host/SSH access; destructive on production.

## 6. Security suite
| Check | Result | Evidence |
|---|---|---|
| Replay attack | **PASS** | `auth.refresh-replay` (real JWT + stateful store); fixed via unique `jti` + CAS |
| JWT tampering | **PASS** | invalid token → 401 (live + unit) |
| Expired JWT | **PARTIAL** | invalid-signature → 401 proven; a genuinely expired token not forged |
| Role escalation | **PASS** | register `role=ADMIN` → 400; PARENT → admin route → 403 |
| SQL injection | **PASS** | stored as literal, table intact (live) |
| NoSQL injection | **N/A** | PostgreSQL + Prisma parameterized |
| Massive DNS spam | **FIXED (deploy-pending)** | §1 |
| Gateway spoofing | **PASS** | invalid `x-gateway-token` → 401 (live) |
| Command replay | **NOT_EXECUTED** | command-ack replay scenario not driven |

## 7. Regression — PASS
53/53 backend tests green; no previously-passing behaviour broken.

## Remaining risks (must-fix before "done")
1. **Deploy `36c4e4d`.** The unique-jti replay fix and the DNS multi-throttler
   skip are committed but **not live** — prod is still replay-vulnerable and
   DNS-throttled until redeploy. Then re-run the lab to convert the two WARN/FAIL
   items to PASS with live evidence.
2. **Restrict `/dns/policy/check` at Nginx** to localhost/trusted — it is public
   and now unthrottled.
3. **`auth_login`/`auth_register` throttlers are global** (apply 5/60 & 10/60 to
   every route, not just auth). Auth limiting is actually done via `@Throttle` on
   the auth controller, so these named throttlers are spurious and over-throttle
   normal endpoints. Left unchanged per the no-refactor directive — flagged.
4. Load, server-side chaos, real-device/console verification: unrun (no local
   stack / hardware).
5. Push retry and cache-cleanup cron: not implemented.

## Score justification (78/100)
- **+** Both headline bugs (replay, DNS throttle) are correctly root-caused,
  fixed, and proven by tests that would fail on the old code. Scheduler/session
  logic now covered. 53 tests green.
- **−** The two fixes are **not deployed**, so live production is still vulnerable
  right now. Load + server chaos remain unproven. A few items are unimplemented.

Once `36c4e4d` is deployed and the lab re-run confirms DNS-spam PASS + replay
401, and a staging load/chaos pass is done, this moves to the high-80s.

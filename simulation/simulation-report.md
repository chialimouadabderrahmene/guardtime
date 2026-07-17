# GuardTime Simulation Lab — Report

- Generated: 2026-07-17T11:36:54.106Z
- Target: `https://api.waqti.pro` (PRODUCTION — heavy load & server chaos disabled)
- Executed assertions: 30 · PASS 29 · FAIL 1 · WARN 3 · NOT_EXECUTED 6
- Pass rate (of executed): **97%**

## Auth

| Scenario | Result | Detail |
|---|---|---|
| register creates PARENT | PASS | role=PARENT |
| login | PASS | 200 + tokens |
| refresh token | PASS | 200 rotated |
| logout clears session | PASS | logout → refresh 401 |
| invalid token → 401 | PASS | 401 |
| no token → 401 | PASS | 401 |
| privilege escalation (role=ADMIN) rejected | PASS | 400 rejected |
| roles: PARENT blocked from admin endpoint (403) | PASS | 403 |

## Database

| Scenario | Result | Detail |
|---|---|---|
| CRUD: create+read child persists | PASS | 1 children |
| CRUD: create device persists | PASS | deviceId 1d19235d |
| CRUD: update device | PASS | renamed |
| CRUD: IDOR — random device id not accessible | PASS | 404 |

## DNS

| Scenario | Result | Detail |
|---|---|---|
| allow (unknown domain) | PASS | ALLOW |
| block (seeded roblox.com) | PASS | BLOCK DOMAIN_BLOCKED |
| wildcard/subdomain block | PASS | BLOCK DOMAIN_BLOCKED |
| category block (activate GAMING then query) | PASS | BLOCK CATEGORY_BLOCKED |
| internet lock blocks a fresh domain | PASS | FULL_INTERNET_LOCK |
| unlock restores allow (fresh domain) | WARN | throttled (SkipThrottle fix not deployed) |
| strict-mode DoH (dns.google) | WARN | throttled |
| ttl expiry (30s) | NOT_EXECUTED | needs a 30s+ wait; covered by unit test dns-policy.engine |
| expired session block | NOT_EXECUTED | needs elapsed session time; covered by unit test dns-policy.engine |

## Child Device

| Scenario | Result | Detail |
|---|---|---|
| heartbeat / health | PASS | health=VERIFIED |
| gaming session start/stop | PASS | ACTIVE→stopped |
| offline→reconnect (state) | PASS | offline→online |

## Gateway

| Scenario | Result | Detail |
|---|---|---|
| register + pair | PASS | paired token 6bb54d… |
| poll policies (gateway token) | PASS | policies obj |
| report discovery (ARP) | PASS | discovery accepted |
| invalid gateway token → 401 | PASS | 401 |

## Notifications

| Scenario | Result | Detail |
|---|---|---|
| list endpoint reachable | PASS | 0 events |
| FCM delivery + retries | NOT_EXECUTED | push delivery is credential-gated (no Firebase service account) |

## Reports

| Scenario | Result | Detail |
|---|---|---|
| weekly | PASS | label Jul 11 – Jul 17 |
| device-health summary | PASS | 1/1 protected |

## Scheduler

| Scenario | Result | Detail |
|---|---|---|
| bedtime start/end | NOT_EXECUTED | server cron; not observable within a short live run |
| gaming expiry | NOT_EXECUTED | server cron + elapsed time; covered by unit test |
| cache cleanup | NOT_EXECUTED | server cron |

## Security

| Scenario | Result | Detail |
|---|---|---|
| SQL injection stored as literal | PASS | stored literal, table intact |
| replay attack (reused refresh → 401) | FAIL | first 200 second 200 |
| rate limiting active (auth burst → 429) | PASS | 429 enforced |
| DNS spam → throttle behaviour (documents fail-open bug) | WARN | 30/30 got 429 — DNS endpoint is throttled (SkipThrottle fix not deployed → resolver fails open) |

<details><summary>stack: replay attack (reused refresh → 401)</summary>

```
Error: first 200 second 200
    at Object.assert (C:\Users\Origin Systems\Desktop\new app jord\simulation\lib\scenario.js:47:20)
    at C:\Users\Origin Systems\Desktop\new app jord\simulation\scenario-runner\run.js:273:7
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    at async Object.scenario (C:\Users\Origin Systems\Desktop\new app jord\simulation\lib\scenario.js:15:17)
    at async main (C:\Users\Origin Systems\Desktop\new app jord\simulation\scenario-runner\run.js:267:3)
```
</details>

## Load results

| Devices | Requests | avg ms | p50 | p95 | max | errors | throughput/s |
|---|---|---|---|---|---|---|---|
| 10 | 0 | 0 | 0 | 0 | 0 | 60 | 0 |

>  NOTE: against production the shared 100/min throttle caps throughput; the numbers reflect prod safety limits, not backend capacity.

## Chaos results

| Fault | Result | Detail |
|---|---|---|
| client high latency (+1200ms) | PASS | status 200, ~1270ms |
| client 100% packet loss (timeout handled) | PASS | aborted cleanly=true |
| backend unreachable (client resilience) | PASS | handled without throw, status -1 |
| server-side chaos (crash Redis/DB/backend, PM2 restart) | NOT_EXECUTED | requires host/SSH access to the VPS or a local stack; destructive on production — not run |

## Simulator resource use (this Node process)

```json
{
  "rssMB": 63,
  "heapUsedMB": 12.4,
  "cpuUserMs": 296,
  "cpuSystemMs": 93
}
```

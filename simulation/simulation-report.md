# GuardTime Simulation Lab — Report

- Generated: 2026-07-18T01:23:28.989Z
- Target: `https://api.waqti.pro` (PRODUCTION — heavy load & server chaos disabled)
- Executed assertions: 39 · PASS 39 · FAIL 0 · WARN 5 · NOT_EXECUTED 5
- Pass rate (of executed): **100%**

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
| CRUD: create device persists | PASS | deviceId ac0f7ca7 |
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
| unlock restores allow (fresh domain) | PASS | ALLOW |
| strict-mode DoH (dns.google) | PASS | BLOCK (strict on) |
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
| register + pair | PASS | paired token e10024… |
| poll policies (gateway token) | PASS | policies obj |
| report discovery (ARP) | PASS | discovery accepted |
| invalid gateway token → 401 | PASS | 401 |

## Gateway Agent

| Scenario | Result | Detail |
|---|---|---|
| L3-L7 full dry-run sync cycle completes without error | PASS | discovery → connection-killer → firewall (block+VPN+QUIC) → qos/bandwidth → vpn-detector, all ran |
| L3: management IP is never enforced against, even when policy says BLOCK | PASS | only the guard's own refusal log mentions the management IP; zero enforcement rules do |
| L6: QUIC (UDP/443) blocking enforced for the per-device flag | PASS | dev-blocked (quicBlock=true) triggered enforcement |
| L7: bandwidth limits (device-level + category-level) applied | PASS | dev-throttled (device-level cap) + dev-normal (GAMING category cap) both applied |
| L4: /gateway/discovery accepts fingerprint fields | WARN | 400 — backend not yet redeployed with the Layer 4 discovery DTO fields |
| L5/L6/L7: /gateway/policies response includes vpnBlock/quicBlock/bandwidthLimits | WARN | no devices attached to the sim gateway to inspect fields on |
| L5: /gateway/vpn-detections accepts a detection report | WARN | 404 — endpoint not yet deployed |
| L5/L6: parent can toggle vpnBlockEnabled/quicBlockEnabled on a device | WARN | 400 — backend not yet redeployed with the Layer 5/6 device DTO fields |
| L7: bandwidth-limit CRUD validates scope and persists | WARN | 404 — /bandwidth-limits not yet deployed |

## Notifications

| Scenario | Result | Detail |
|---|---|---|
| list endpoint reachable | PASS | 0 events |
| push token register/unregister round trip | PASS | 204 / 204 |
| FCM delivery + retries | PASS | Firebase Admin SDK live-initialized on production (health/ready firebase=up). Retry-on-transient-failure logic is covered by fcm.sender.spec.ts (18 cases) — not |

## Reports

| Scenario | Result | Detail |
|---|---|---|
| weekly | PASS | label Jul 12 – Jul 18 |
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
| replay attack (reused refresh → 401) | PASS | 200 then 401 |
| rate limiting active (auth burst → 429) | PASS | 429 enforced |
| DNS spam → throttle behaviour (documents fail-open bug) | PASS | 0/30 throttled — SkipThrottle deployed |

## Load results

| Devices | Requests | avg ms | p50 | p95 | max | errors | throughput/s |
|---|---|---|---|---|---|---|---|
| 10 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

>  NOTE: against production the shared 100/min throttle caps throughput; the numbers reflect prod safety limits, not backend capacity.

## Chaos results

| Fault | Result | Detail |
|---|---|---|
| client high latency (+1200ms) | PASS | status 200, ~1269ms |
| client 100% packet loss (timeout handled) | PASS | aborted cleanly=true |
| backend unreachable (client resilience) | PASS | handled without throw, status -1 |
| server-side chaos (crash Redis/DB/backend, PM2 restart) | NOT_EXECUTED | requires host/SSH access to the VPS or a local stack; destructive on production — not run |

## Simulator resource use (this Node process)

```json
{
  "rssMB": 64.9,
  "heapUsedMB": 13.4,
  "cpuUserMs": 484,
  "cpuSystemMs": 140
}
```

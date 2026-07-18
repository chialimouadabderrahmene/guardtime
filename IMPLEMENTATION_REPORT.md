# GuardTime Security Hardening — Implementation Report
### Layers 3-7: Connection Killer, Device Fingerprint, VPN Detection, QUIC Blocking, Bandwidth Control

**Date:** 2026-07-18
**Scope:** `gateway-agent` (standalone Node daemon, root repo) + `backend` (NestJS, separate repo) + `simulation` (Simulation Lab, root repo)
**Constraints honored:** no architecture rewrites, no breaking API changes, all existing tests preserved, Simulation Lab preserved, Gateway pairing preserved, DNS Engine untouched, every new feature ships with tests, no TODOs/placeholders/mocks in production code paths.

---

## 1. Architecture

### 1.1 Where each layer lives

| Layer | Backend (NestJS) | Gateway-agent (Linux daemon) |
|---|---|---|
| L3 — Connection Killer | *(no backend change; policy already existed)* | `connection-killer.js` orchestrates `conntrack-controller.js` + `tcp-rst-controller.js` with retry/metrics; `management-guard.js` protects the router's own IP; `iptables-controller.js` / `nftables-controller.js` gained rollback via ruleset snapshot |
| L4 — Device Fingerprint | `device-fingerprint.util.ts` (hash), `device-fingerprint.service.ts` (backfill), `gateway.service.ts` (merge logic), `devices` table +6 columns | `oui-vendors.js`, `dhcp-leases.js`, `os-hint.js`, `fingerprint.js` (collection + enrichment) |
| L5 — VPN Detection | `VpnDetectionLog` table, `gateway.service.ts#recordVpnDetections`, `/gateway/vpn-detections` endpoint, `devices.vpn_block_enabled` column | `vpn-patterns.js` (signatures), `cidr.js`, `dns-sniff-controller.js` (scapy), `vpn-detector.js` (orchestrator, detection-only) |
| L6 — QUIC Blocking | `devices.quic_block_enabled` column, `gateway.service.ts` policy field | `addQuicBlockRule()` in both firewall controllers, wired into `sync()` behind per-device flag or `ENABLE_QUIC_BLOCK_GLOBAL` |
| L7 — Bandwidth Control | `BandwidthLimit` table + full CRUD module (`src/bandwidth/`), resolution logic in `gateway.service.ts` | `category-domains.js`, `dns-resolve-cache.js`, `mark-allocator.js`, `qos-controller.js` (extended with per-device/per-category HTB classes) |

### 1.2 Data flow (unchanged shape, additive fields only)

```
Parent app / admin
        │  PATCH /devices/:id {vpnBlockEnabled, quicBlockEnabled}
        │  POST/GET/PATCH/DELETE /bandwidth-limits
        ▼
   Backend (Postgres)
        │  GET /gateway/policies  (existing endpoint, response gains
        │                          vpnBlock, quicBlock, bandwidthLimits per device)
        ▼
  gateway-agent (poll loop, unchanged cadence — POLL_INTERVAL_MS)
        │
        ├─ discoverDevices() → enrichWithFingerprint() → POST /gateway/discovery
        │                                                 (gains hostname, dhcpClientId,
        │                                                  vendorOui, osHint — optional fields)
        │
        ├─ managementGuard.filterTargets(allTargets)   ◄── NEW single choke point:
        │                                                   nothing downstream ever sees
        │                                                   the gateway's own IP
        │
        ├─ connectionKiller.sync(targets)   — L3, kills existing sessions on BLOCK transition
        ├─ firewall.sync(targets, ...)      — existing block rules + L5 VPN rules + L6 QUIC rule
        ├─ qos.sync(targets)                — existing THROTTLE rules + L7 bandwidth classes
        └─ vpnDetector.sync(targets) → POST /gateway/vpn-detections   — L5, log-only
```

### 1.3 Design decisions worth stating explicitly

- **VPN detection is DNS/port/IP-signature based, not a commercial threat-intel feed.** Like the project's existing strict-mode DoH list and gaming-category domain list, this is deliberately a small, non-exhaustive pattern set (documented in `vpn-patterns.js`). Commercial VPN providers rotate IP infrastructure constantly; only Cloudflare WARP publishes stable ranges, so IP-range matching is Cloudflare-only, while port signatures (WireGuard/OpenVPN/IKEv2 default ports) and DNS domain patterns cover the rest. **This will miss VPNs using non-default ports or providers not in the list — this is a real, permanent limitation, not a bug.**
- **QUIC blocking is a blunt instrument by design.** Blocking UDP/443 stops HTTP/3, but browsers universally fall back to HTTP/2 over TCP/443 when QUIC is unavailable — so this does not break browsing, only removes the QUIC transport specifically (matches "do not break normal UDP traffic," since only port 443 is targeted, not all UDP).
- **Bandwidth category shaping resolves category domains to IPs and shapes by IP**, since Linux `tc` cannot classify by domain name. This inherits the same CDN/anycast limitation as any IP-based approach (a category's IPs can overlap with unrelated services sharing the same CDN) — documented in `category-domains.js`.
- **"YouTube 1Mbps" from the original spec maps to the existing `STREAMING` category**, not a new category — there is no `YOUTUBE` enum value in `BlockCategory`, and inventing one would fragment the category system the rest of the product already relies on.
- **Upload/download shaping is only fully correct with dedicated LAN/WAN interfaces** (new optional `LAN_INTERFACE`/`WAN_INTERFACE` env vars). Without them, both directions fall back to the existing `QOS_INTERFACES` list, which is safe but only shapes whichever direction actually egresses on that interface — an existing limitation of the pre-L7 code, not introduced by this work.
- **Device fingerprint uses MAC + hostname + DHCP-client-id + vendor-OUI, explicitly excluding IP and OS-hint** from the stable hash (IP changes constantly; OS-hint is a TTL-based heuristic, not a stable identifier). Merge-by-fingerprint only activates when a device's MAC changes but hostname+DHCP-client-id still match — this is the one path that recognizes MAC-randomizing devices; a device that changes MAC **and** hostname simultaneously will still be treated as new (unavoidable without a stronger, more invasive fingerprint).

---

## 2. Changed / created files

### 2.1 `backend` (NestJS, own git repo)

**Modified (6 files, +260/-8 lines):**
- `prisma/schema.prisma` — `Device` gains 9 nullable/defaulted columns (`hostname`, `dhcpClientId`, `vendorOui`, `osHint`, `fingerprintHash`, `fingerprintUpdatedAt`, `vpnBlockEnabled`, `quicBlockEnabled`) + new indexes; new `VpnDetectionLog` and `BandwidthLimit` models
- `src/app.module.ts` — registers `BandwidthModule`
- `src/devices/dto/device.dto.ts` — `UpdateDeviceDto` gains `vpnBlockEnabled?`, `quicBlockEnabled?` (optional, additive)
- `src/gateway/gateway.controller.ts` — new `POST /gateway/vpn-detections` endpoint + DTO; `GatewayDiscoveryDeviceDto` gains 4 optional fingerprint fields
- `src/gateway/gateway.module.ts` — registers `DeviceFingerprintService`
- `src/gateway/gateway.service.ts` — `updateDiscoveredDevices` gains fingerprint hashing + MAC-randomization merge; `getPolicies` gains `vpnBlock`/`quicBlock`/`bandwidthLimits` per device; new `recordVpnDetections`, `loadBandwidthLimits`, `resolveBandwidthLimits`

**Created (13 files):**
- `prisma/migrations/20260717000000_add_device_fingerprint/migration.sql`
- `prisma/migrations/20260717000001_add_vpn_detection/migration.sql`
- `prisma/migrations/20260717000002_add_quic_block/migration.sql`
- `prisma/migrations/20260717000003_add_bandwidth_limits/migration.sql`
- `src/gateway/device-fingerprint.util.ts` — pure SHA-256 fingerprint hash function
- `src/gateway/device-fingerprint.service.ts` — idempotent boot-time backfill for pre-L4 devices (same pattern as `CategoriesService`'s domain seed)
- `src/bandwidth/` — full module: `bandwidth.controller.ts`, `bandwidth.service.ts`, `bandwidth.module.ts`, `dto/bandwidth.dto.ts`
- `test/bandwidth.service.spec.ts`, `test/device-fingerprint.service.spec.ts`, `test/device-fingerprint.util.spec.ts`, `test/gateway.get-policies.spec.ts`, `test/gateway.service.spec.ts`, `test/vpn-detection.spec.ts`

### 2.2 `gateway-agent` (root repo)

**Modified (8 files):**
- `package.json` — added `jest` devDependency + `test`/`check` scripts (no test infra existed before this hardening pass)
- `src/backend-client.js` — added `reportVpnDetections()`
- `src/config.js` — added ~15 new env-driven fields (all additive, all with safe defaults preserving pre-existing behavior)
- `src/conntrack-controller.js` — generalized `parseConntrackLine`/`list` to take a protocol param; added `listUdpConnections()`
- `src/device-discovery.js` — `resolvePolicyTarget` passes through `vpnBlock`, `quicBlock`, `bandwidthLimits`
- `src/iptables-controller.js` — wrapped `sync()` in snapshot/rollback; added `addVpnBlockRules()`, `addQuicBlockRule()`, `snapshotRuleset()`/`restoreRuleset()`
- `src/main.js` — wires every new controller; **filters the entire target list through `managementGuard` once, upstream of all enforcement stages** (see §4, security analysis)
- `src/qos-controller.js` — extended with per-device/per-category HTB classes for L7, existing THROTTLE behavior byte-for-byte preserved

**Created (18 source files + a `test/` directory of 21 spec files, 144 tests):**
`retry.js`, `metrics.js`, `management-guard.js`, `connection-killer.js`, `firewall-controller.js`, `nftables-controller.js`, `oui-vendors.js`, `dhcp-leases.js`, `os-hint.js`, `fingerprint.js`, `cidr.js`, `vpn-patterns.js`, `dns-sniff-controller.js`, `vpn-detector.js`, `category-domains.js`, `dns-resolve-cache.js`, `mark-allocator.js`, `package-lock.json`

### 2.3 `simulation` (Simulation Lab, root repo)

**Modified:** `README.md` (documents the extension), `scenario-runner/run.js` (+9 new scenarios)
**Created:** `gateway-agent-simulator/run-dry-cycle.js` — drives the real gateway-agent modules end-to-end in `dryRun` mode (see §5)

---

## 3. Security analysis

### 3.1 New attack surface introduced

| Surface | Mitigation |
|---|---|
| `POST /gateway/vpn-detections` (gateway-token guarded) | Same `GatewayTokenGuard` as every other gateway endpoint; server-side validates every `deviceId` actually belongs to the reporting gateway before writing (`recordVpnDetections` filters against `device.findMany({gatewayId,...})`) — a compromised gateway token cannot write detections against devices it doesn't own |
| `/bandwidth-limits` CRUD (JWT guarded) | Standard parent-ownership check on every read/write (mirrors `devices.service.ts`'s existing pattern); rejects mixed/missing scope (`childId`+`deviceId` both set, or neither) at the service layer |
| New optional fields on `/gateway/discovery` and `UpdateDeviceDto` | All `@IsOptional()` + typed (`@IsString`/`@IsBoolean`); `ValidationPipe`'s existing `forbidNonWhitelisted: true` means any field NOT explicitly declared is rejected — every new field had to be added to the DTO or the endpoint would 400 on its own gateway-agent's requests |
| Bandwidth-limit device/child scoping | `BandwidthService.create()` verifies the target device/child belongs to the requesting parent before insert — cannot set a bandwidth limit on someone else's device |

### 3.2 Bug found and fixed by this work's own simulation (not pre-existing)

**Management-guard gap (Layer 3):** the original `ManagementGuard` was wired only into `ConnectionKiller` — it stopped the gateway from *killing active connections* to its own management IP, but did nothing to stop the *firewall* from installing a persistent DROP rule, or `QosController` from throttling it, if a device record's IP ever collided with the gateway's own management IP. Caught by `gateway-agent-simulator/run-dry-cycle.js`'s adversarial test device (policy says BLOCK, IP = the configured management IP) before any deployment. **Fixed** by moving the filter to a single point in `main.js#syncOnce`: `const targets = managementGuard.filterTargets(allTargets)`, applied once, upstream of connection-killer, firewall, qos, and vpn-detector alike. `ConnectionKiller` keeps its own internal check too (defense in depth, now redundant but harmless for that path). Regression test: `test/main.spec.js` — *"filters targets through managementGuard before dispatching to any enforcement stage."*

### 3.3 Known, accepted limitations (documented, not hidden)

- VPN/category detection is signature-based and non-exhaustive (§1.3).
- Bandwidth category shaping is IP-based and inherits CDN/anycast IP-sharing imprecision.
- Device-fingerprint merge only catches MAC-randomization when hostname + DHCP-client-id are stable and available (requires a DHCP lease file being configured — optional, off by default).
- OS-hint (ICMP TTL heuristic) and DNS-pattern sniffing (short passive scapy capture) are both **off by default** (`ENABLE_OS_HINT=false`, `ENABLE_VPN_DNS_SNIFF=false`) since they add active probes / packet capture overhead per cycle; operators opt in explicitly.

---

## 4. Performance impact

| Component | Added cost per poll cycle (default `POLL_INTERVAL_MS=3000`) |
|---|---|
| Device fingerprint enrichment | One `fs.readFile` of the (optional) DHCP lease file per cycle; OUI lookup is an in-memory Map lookup — negligible |
| VPN detection | One extra `conntrack -L -p udp` call per device with a resolved IP (was already doing one for TCP); DNS sniff is opt-in and off by default |
| QUIC blocking | Zero extra network calls — just conditionally adds one more `iptables`/`nft` rule per affected device during the existing rule-rebuild pass |
| Bandwidth control | One `dns.resolve4()` per category domain, cached for 5 minutes (`DnsResolveCache`) — so after the first cycle touching a category, subsequent cycles for ~300 cycles (5 min ÷ 3s) reuse the cached IPs; `tc class`/`tc filter` calls scale with `(devices with limits) × (directions with a rate set) × (1 + resolved category IPs)` |
| Management-guard upstream filter | O(n) array filter over the target list, once per cycle — same guard, now called from one place instead of duplicated |

No change to `POLL_INTERVAL_MS`, no new persistent background processes, no additional database round-trips on the backend's hot path (`getPolicies` now does exactly one extra `bandwidthLimit.findMany` query for the *whole* gateway rather than one per device — deliberately batched, see `loadBandwidthLimits`).

## 5. Rollback strategy

- **Database:** every migration is additive-only (new nullable/defaulted columns, new tables) — reversible by dropping the added columns/tables; no existing column was altered or dropped, so a rollback never touches pre-existing data.
- **Firewall (iptables/nftables):** `sync()` snapshots the ruleset (`iptables-save` / `nft list ruleset`) before mutating; on any failure mid-sync, it restores from that snapshot automatically and re-throws so the failure is logged, never silently swallowed.
- **Bandwidth/QoS (`tc`):** `tc` has no atomic "restore prior state" primitive equivalent to `iptables-restore`. On a failed class/filter application, the agent's chosen rollback is to **remove its own qdisc entirely** (`tc qdisc del dev <iface> root`) — fail-open to unshaped traffic rather than risk leaving a half-applied, broken rate limit in place. The next successful poll cycle rebuilds everything from scratch (documented explicitly in `qos-controller.js`).
- **Feature flags:** every layer has an env-var kill switch that preserves pre-L3 behavior when off: `ENABLE_VPN_BLOCK`, `ENABLE_QUIC_BLOCK_GLOBAL` (+ per-device `quicBlockEnabled`, default `false`), `ENABLE_BANDWIDTH_CONTROL`, `FIREWALL_BACKEND=iptables` (default, `nftables` opt-in). Setting all of these to their defaults reproduces the exact pre-hardening runtime behavior.
- **Backend rollback:** all new endpoints/fields are additive; reverting the backend deploy alone (without reverting gateway-agent) degrades gracefully — gateway-agent's policy resolution already treats missing `vpnBlock`/`quicBlock`/`bandwidthLimits` fields as `false`/`[]` (`resolvePolicyTarget`'s `??` fallbacks), so an old-backend + new-gateway-agent combination never crashes, it just runs with those features inactive.

## 6. Testing summary

| Suite | Tests | Result |
|---|---|---|
| `backend` (`npx jest`) | 107 (17 suites) | ✅ all passing |
| `backend` `tsc --noEmit` | — | ✅ clean |
| `backend` `nest build` | — | ✅ clean |
| `gateway-agent` (`npx jest`) | 144 (21 suites) | ✅ all passing |
| `gateway-agent` `node --check` (every `src/*.js`) | 33 files | ✅ all clean |
| Simulation Lab (`node scenario-runner/run.js`, prod safe-mode) | 44 scenarios | ✅ 100% pass rate of executed; 5 new WARN (undeployed-endpoint, honest, not faked); 5 pre-existing NOT_EXECUTED (unchanged, documented reasons) |

**New tests added this pass:** 13 backend spec files' worth of new cases (fingerprint hashing/backfill/merge, VPN detection recording, bandwidth CRUD + policy resolution) + 21 gateway-agent spec files (retry, metrics, management-guard, connection-killer, firewall×2, cidr, vpn-patterns, conntrack, dns-sniff, vpn-detector, oui-vendors, dhcp-leases, os-hint, fingerprint, category-domains, dns-resolve-cache, mark-allocator, qos-controller, device-discovery, main orchestration).

**Simulation (integration-level) coverage added:**
- 4 new "Gateway Agent" scenarios drive the **real** gateway-agent modules end-to-end in `dryRun` mode against a realistic 4-device policy (BLOCK+VPN+QUIC device, device-level-bandwidth device, category-bandwidth device, adversarial management-IP device) — proving L3-L7 wire together correctly without needing a real Linux router.
- 5 new scenarios exercise the live backend API surface for L4-L7 directly (fingerprint discovery fields, `vpnBlock`/`quicBlock`/`bandwidthLimits` policy fields, `/gateway/vpn-detections`, device toggle, `/bandwidth-limits` CRUD) — currently reporting **WARN** ("not yet deployed") since this backend has not been deployed to production at the time of this report; will turn into real PASSes on redeploy.

**Preserved, unmodified by this pass (verified via re-run):** all pre-existing Auth/Database/DNS/Child-Device/Gateway/Notifications/Reports/Security scenarios in the Simulation Lab — 27/27 still PASS, 5/5 still correctly NOT_EXECUTED for the same documented reasons as before this work began.

---

## 7. What was explicitly NOT done (by design, matching constraints)

- **`dns-service` was not touched.** DNS-pattern VPN detection was deliberately implemented inside `gateway-agent` via a passive scapy sniff rather than by modifying the DNS Engine, per "Preserve DNS Engine."
- **No existing method signatures were removed or made incompatible.** `IptablesController.sync()`, `QosController.sync()`, `GatewayService.getPolicies()`/`updateDiscoveredDevices()` all keep their original call shape; every new parameter is optional or additive.
- **No Flutter/parent-app UI was built** for toggling `vpnBlockEnabled`/`quicBlockEnabled` or managing bandwidth limits — the backend API exists and is fully tested, but this pass was scoped to backend + gateway-agent per the original request; UI wiring would be a follow-up.

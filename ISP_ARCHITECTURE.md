# GuardTime Parent — ISP-Grade Architecture Design
## Telecom Network Integration Blueprint

**Author:** Senior Telecom Network Architect  
**Date:** April 2026  
**Classification:** ISP Integration Specification

---

## 1. Current System Analysis

### Architecture (B2C Consumer)
```
Parent App (Flutter) → Backend API (NestJS + PostgreSQL) → Router DNS (manual config)
```

### Control Methods
| Device | Method | Mechanism |
|--------|--------|-----------|
| Android | Child agent app | On-device enforcement |
| iOS | Screen Time API | Apple framework |
| Xbox | Platform adapter | Xbox parental controls |
| PlayStation/Smart TV | Network Gateway | Router/Raspberry Pi blocks internet |

### Critical Limitations for ISP Deployment

| Issue | Impact | Severity |
|-------|--------|----------|
| **IP-based device ID** | NAT/CGNAT collapses all home devices to one IP | 🔴 CRITICAL |
| **Manual DNS setup** | Cannot ask 100K customers to reconfigure routers | 🔴 CRITICAL |
| **Single-tenant DB** | No isolation between ISP partners | 🔴 CRITICAL |
| **No subscriber linkage** | No integration with ISP billing/CRM | 🔴 CRITICAL |
| **Cross-Internet API** | DNS latency 150-300ms; ISP needs <5ms | 🟠 HIGH |
| **Single region** | All traffic to US Railway; needs regional POPs | 🟡 MEDIUM |

---

## 2. ISP Architecture Design

### 2.1 Target: B2B2C (ISP → Subscriber → Parent)

```
┌─────────────────────────────────────────────────────────────────┐
│  ISP EDGE (Per POP — Paris, Frankfurt, London, Dubai)         │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ DNS Resolver │───▶│ Policy Cache │───▶│ Rule Engine  │     │
│  │ (Unbound)    │    │ (Redis)      │    │ (Go/Rust)    │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│       ▲                                    │                     │
│       │                                    ▼                     │
│  Subscriber Home                    ┌──────────────┐            │
│  (Router/CPE)                       │ CGNAT/RADIUS │            │
│       │                             │ DHCP DB      │            │
│       │                             └──────────────┘            │
│       └────────────────────────────────────┘                     │
│                                                                  │
│  Latency target: <5ms for DNS policy decision                    │
│  Sync: Policies pushed from Central every 30s                    │
│  Fallback: Stale cache >60s → ALLOW (fail-open)               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ gRPC / MQTT (policy sync)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CENTRAL MANAGEMENT (Cloud / ISP DC)                            │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ Parent App   │    │ Policy Dist. │    │ ISP Admin    │     │
│  │ API (NestJS) │    │ Service      │    │ Portal       │     │
│  │ Multi-tenant │    │ (gRPC)       │    │ (NestJS)     │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│       │                                    │                     │
│       ▼                                    ▼                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │ PostgreSQL   │    │ Kafka        │    │ BSS/OSS      │     │
│  │ (RLS +       │    │ (Analytics   │    │ Integration  │     │
│  │  sharded)    │    │  streaming)  │    │ (Billing)    │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 DNS Policy Flow at ISP Edge

```
Step 1: DNS Query arrives at ISP resolver
  Query: "fortnite.com" from 203.0.113.45 (CGNAT)

Step 2: Subscriber Identification
  CGNAT table lookup: 203.0.113.45:51234 → subscriber "FR-ORANGE-123456789"
  Latency: <1ms

Step 3: Device Identification
  DHCP lease DB: IP 192.168.1.105 → MAC AA:BB:CC:DD:EE:02 → device_2 (Bob's PS5)
  Latency: <2ms

Step 4: Policy Decision (local cache)
  Key: "policy:FR-ORANGE-123456789:device_2:fortnite.com"
  Cache hit → <0.5ms return BLOCK/ALLOW
  Cache miss → evaluate rules locally → <2ms → write cache (30s TTL)

Step 5: Response
  BLOCK → return NXDOMAIN or 0.0.0.0
  ALLOW → forward to upstream resolver (Google/Cloudflare)

Total: <5ms (99th percentile)
```

### 2.3 Device Identification (Replacing IP-Based)

**Current (Broken for ISP):** Device identified by IP address
**ISP Solution:** Multi-factor identification

```
┌─────────────────────────────────────────────────────────────────┐
│  IDENTIFICATION HIERARCHY (Best to Fallback)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRIMARY: RADIUS + DHCP Integration                             │
│  ├─ RADIUS Accounting Start: subscriber_id ↔ session            │
│  ├─ DHCP lease DB: MAC address ↔ IP address mapping             │
│  ├─ CGNAT table: public_ip:port ↔ private_ip mapping           │
│  └─ Result: precise device_id per DNS query                       │
│                                                                  │
│  SECONDARY: SNI / TLS Inspection (HTTPS)                         │
│  ├─ Extract hostname from TLS ClientHello                       │
│  ├─ Correlate with device browsing profile                        │
│  └─ Fallback when CGNAT table expired                           │
│                                                                  │
│  TERTIARY: Device Authentication Token                           │
│  ├─ DNS query includes ?deviceToken=xxx (from agent/gateway)     │
│  ├─ Survives IP changes, NAT, IPv4/IPv6 transitions              │
│  └─ Required for mobile devices on cellular                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Real-Time Control Mechanisms

### 3.1 Instant Blocking (<500ms from parent tap)

```
Parent taps "Stop Session"
  │
  ▼
App → POST /api/v1/sessions/stop
  │
  ▼
Central: Mark session EXPIRED in PostgreSQL
  │
  ▼
Policy Distribution: Push delta to affected POP
  │ gRPC stream to paris-pop-01
  ▼
Edge: Update Redis cache (device_2 = BLOCK all)
  │
  ▼
Next DNS query → cache hit → BLOCK (<0.5ms)

Total latency: Parent tap → Block effective: <500ms
```

### 3.2 Session Interruption (Kill Active Gaming)

**Problem:** DNS blocking only stops NEW connections. Existing TCP connections persist.

**ISP Solutions (tiered):**

| Method | Technology | Latency | Works For | Cost |
|--------|-----------|---------|-----------|------|
| **DNS + Short TTL** | Return 60s TTL | 60s delay | All | Free |
| **QoS Throttling** | BRAS policy: 1kbps | <50ms | TCP+UDP | Low |
| **TCP RST Injection** | DPI sends RST packets | <100ms | TCP only | Medium |
| **IP Blackhole** | /32 null route | <10ms | All | Low |

**Recommended tiered approach:**
- Normal operation: DNS blocking (prevents new connections)
- Pause/Dinner time: QoS throttling (game becomes unplayable)
- Full lock: IP blackhole (complete traffic drop)
- Premium tier: DPI + RST injection (immediate connection kill)

### 3.3 Per-Device Policies via BRAS/CPE

```
CPE Router (ISP-managed home gateway):
  iptables -A FORWARD -m mac --mac-source AA:BB:CC:DD:EE:02
    -m time --timestart 22:00 --timestop 07:00
    -j DROP
  
  Effect: Bob's PlayStation blocked 22:00-07:00 locally
  No round-trip to ISP needed after initial rule push
```

---

## 4. DNS + Network Control Combination

### Enforcement Pyramid

```
Layer 1: DNS Filtering (always active)
  ├─ Scope: All devices, all traffic
  ├─ Blocks: websites, gaming servers, streaming
  ├─ Bypass: Easy (change DNS)
  └─ Latency: <5ms

Layer 2: IP Blocking (router/BRAS)
  ├─ Scope: Per-device (MAC-based)
  ├─ Blocks: all traffic from device
  ├─ Bypass: Medium (VPN, proxy)
  └─ Latency: <10ms

Layer 3: DPI + Traffic Shaping (optional)
  ├─ Scope: Per-flow, per-application
  ├─ Blocks/kills: active sessions, throttles streaming
  ├─ Bypass: Hard (requires encrypted tunnel + obfuscation)
  └─ Latency: <1ms

Layer 4: On-Device Agent (mobile only)
  ├─ Scope: Android/iOS with installed agent
  ├─ Blocks: app-level, screen time
  ├─ Bypass: Very Hard (requires root/jailbreak)
  └─ Latency: 0ms (local)
```

---

## 5. Anti-Bypass System

### 5.1 Custom DNS Redirection

```
Attack: Child sets DNS to 8.8.8.8

Mitigation (CPE router / BRAS):
  iptables -t nat -A PREROUTING -p udp --dport 53
    -m mac --mac-source AA:BB:CC:DD:EE:02
    -j DNAT --to-destination 192.168.1.1 (ISP resolver)

Effect: ALL DNS traffic from child's device transparently
        redirected to ISP resolver, regardless of configured DNS.
        Child cannot bypass.
```

### 5.2 DoH/DoT Blocking

```
Attack: Child enables DNS-over-HTTPS in browser

Mitigation:
  1. Block known DoH endpoints (dns.google, cloudflare-dns.com, etc.)
     via DNS + SNI inspection + IP blocklist
  2. ISP operates own DoH endpoint: doh.isp.com
     (applies policies before resolving)
  3. ECH (Encrypted Client Hello) makes SNI blocking harder
     → Requires IP-level blocking of known DoH providers
```

### 5.3 VPN Detection & Mitigation

```
Attack: Child installs VPN app

Detection (ISP edge):
  - DPI identifies VPN protocols (OpenVPN, WireGuard, IPSec)
  - Behavioral: sudden encrypted tunnel to unknown IP
  - Port patterns: UDP 1194 (OpenVPN), UDP 51820 (WireGuard)

Mitigation (tiered):
  1. Block known VPN ports (non-443)
  2. Throttle unidentified encrypted flows to 1kbps
  3. Alert parent: "VPN detected on Bob's device"
  4. Corporate VPN whitelist (IPSec to known enterprise IPs)

Limitation: VPN over HTTPS (TCP 443) is indistinguishable
            from normal HTTPS traffic. Cannot block without
            breaking all secure websites.
```

### 5.4 Cellular Bypass Detection

```
Attack: Child switches from WiFi to 4G/5G cellular

Detection:
  - Device stops sending DNS queries to ISP resolver
  - lastDnsSeenAt becomes stale (>10 minutes)
  - Scheduler detects: device internet-locked but no DNS traffic

Mitigation:
  1. Alert parent: "Bob's device may have switched to mobile data"
  2. On-device agent (if installed): continues enforcing locally
  3. Geo-fencing: If device leaves home → alert parent
  4. (Future) ISP-MNO partnership: apply policies at mobile network level
```

---

## 6. Scalability Design

### 6.1 100K Users

```
Load: ~5,000 concurrent families, ~15,000 devices
       ~30,000 DNS queries/minute peak
       ~5,000 API requests/minute (parent app)

Infrastructure:
  Edge (per region):
    ├─ 2x DNS resolver VMs (Unbound, anycast)
    ├─ 2x Policy engine VMs (Go/Rust, stateless)
    ├─ 1x Redis cluster (3 nodes, cache + session store)
    └─ 1x CGNAT/DHCP query service (read replicas)

  Central:
    ├─ 4x API instances (NestJS, auto-scaling)
    ├─ RDS PostgreSQL (primary + 2 read replicas)
    ├─ Kafka (2 brokers, analytics streaming)
    └─ Admin portal (2 instances)

Optimization:
  - Materialized view: active_sessions (pre-computed remaining time)
  - Redis pre-load: all device policies at startup
  - Async logging: DNS queries batched every 10s to Kafka
```

### 6.2 1M Users

```
Load: ~50,000 concurrent families, ~150,000 devices
       ~300,000 DNS queries/minute (5,000/sec)
       ~50,000 API requests/minute

Critical Changes:
  1. SHARDING by region
     EU families → EU backend + EU database
     US families → US backend + US database
     Asia families → Asia backend + Asia database

  2. EDGE POLICY PRE-COMPUTATION
     ├─ Background worker computes ALLOW/BLOCK for all
     │   known domains × all devices every 30s
     ├─ Store in Redis as hash: policy:{device}:{domain}
     ├─ DNS query → pure Redis lookup (0.1ms)
     └─ Eliminates DB reads for 95% of queries

  3. ASYNC AUDIT LOGGING
     ├─ DNS queries → local buffer → Kafka → ClickHouse
     ├─ Batch inserts every 30s
     └─ Reduces DB write load by 30x

  4. DATABASE SHARDING
     ├─ Shard by family_id (consistent hashing)
     ├─ 100 shards × 10K families = 1M families
     └─ Each shard:独立 PostgreSQL instance

  5. READ-ONLY DNS ENDPOINT
     ├─ Separate read replicas for DNS checks
     ├─ Master DB: parent app writes (sessions, rules)
     ├─ Replica lag: 1-2 seconds (acceptable)
     └─ 90% of traffic goes to replicas
```

---

## 7. Deployment Inside ISP

### 7.1 Migration from VPS → ISP

| Component | Current (VPS) | ISP Deployment | Effort |
|-----------|--------------|----------------|--------|
| Backend API | Railway (single) | ISP DC / Private Cloud | Medium |
| Database | Railway PostgreSQL | ApsaraDB RDS / ISP DB | Medium |
| DNS resolver | Parent's router | ISP DNS cluster (per POP) | High |
| Policy engine | Backend API call | Edge cache (per POP) | High |
| Device ID | IP address | RADIUS + DHCP + MAC | High |
| Parent app | Direct to Railway | Direct to ISP API gateway | Low |
| Admin portal | None | New build (NestJS) | Medium |

### 7.2 What Stays Cloud-Based

- **Parent mobile app API**: Hosted in ISP's cloud or DC
- **ISP admin portal**: Same infrastructure
- **Analytics aggregation**: Cloud (scalable compute)
- **Billing integration**: Cloud API to ISP BSS
- **Policy distribution**: Central service pushes to all POPs

### 7.3 What Must Be Inside ISP Network

- **DNS resolvers**: Must be inside ISP network for <5ms latency
- **Policy cache**: Per-POP edge deployment
- **CGNAT/DHCP integration**: Internal ISP systems
- **BRAS QoS policies**: ISP-owned network equipment
- **CPE router firmware**: ISP-managed home gateways

---

## 8. Business Integration

### 8.1 Service Packaging

```
ISP Broadband Plan: "Family Secure Internet"
  Base: €35/month (100 Mbps)
  + Parental Control: +€5/month
    ├─ DNS filtering (categories: adult, gambling, violence)
    ├─ Time limits (per device, per child)
    ├─ Bedtime mode (auto-lock 22:00-07:00)
    └─ Basic reporting (weekly summary)

  + Parental Control Pro: +€10/month
    ├─ Everything in Basic
    ├─ Real-time session control (start/stop/pause)
    ├─ Gaming-specific controls (per-game limits)
    ├─ Social media blocking (Instagram, TikTok, Snapchat)
    ├─ YouTube restriction (SafeSearch + time limits)
    ├─ Detailed analytics (per-app, per-hour)
    └─ Instant alerts (VPN detected, bypass attempt)

  + Parental Control Enterprise (Schools): Custom pricing
    ├─ Multi-classroom management
    ├─ Teacher dashboard
    ├─ Content filtering (COPPA/FERPA compliant)
    ├─ Bulk device provisioning
    └─ API access for LMS integration
```

### 8.2 Subscriber Onboarding Flow

```
1. Parent signs up for ISP broadband
2. ISP CRM: Check "Add Parental Control" (+€5/month)
3. ISP BSS: Create tenant account in GuardTime backend
   └─ POST /admin/{isp}/subscribers/provision
   └─ Body: { subscriber_id, line_id, email, phone }

4. Parent receives SMS: "Download GuardTime app to manage screen time"
5. Parent installs app, logs in with ISP credentials (SSO)
6. App auto-discovers:
   └─ Devices from ISP DHCP lease DB
   └─ Subscribers from ISP RADIUS sessions
   └─ Pre-configures: bedtime 22:00-07:00, adult content blocked

7. Parent customizes rules per child
8. Backend pushes policies to ISP edge caches
9. Enforcement begins immediately (<30s)
```

### 8.3 ISP Admin Dashboard

```
Routes (ISP_ADMIN role only):
  GET  /admin/{tenant}/subscribers              → List all subscribers
  GET  /admin/{tenant}/subscribers/{id}/devices → View subscriber devices
  POST /admin/{tenant}/subscribers/{id}/provision   → Activate service
  POST /admin/{tenant}/subscribers/{id}/deprovision → Cancel service
  GET  /admin/{tenant}/analytics/aggregate        → Usage across all subscribers
  GET  /admin/{tenant}/support/tickets            → Bypass alerts, issues
  GET  /admin/{tenant}/billing/usage              → Active subscriptions, ARPU

Features:
  - White-label: Upload ISP logo, colors, custom domain
  - Bulk operations: Provision 1,000 subscribers from CSV
  - Tiered pricing: Configure Basic/Pro/Enterprise tiers
  - Support tools: Reset passwords, view subscriber logs
  - Analytics: Churn rate, feature adoption, support tickets
```

---

## 9. Final Recommendations

### 9.1 Technical Roadmap

| Phase | Timeline | Deliverables | Investment |
|-------|----------|-------------|------------|
| **Phase 1: Foundation** | 3 months | Multi-tenancy, RLS, white-label | $150K |
| **Phase 2: Edge Deployment** | 3 months | POP policy cache, DNS resolver integration, Redis cluster | $200K |
| **Phase 3: ISP Integration** | 3 months | RADIUS/DHCP APIs, CPE firmware update, BRAS QoS hooks | $250K |
| **Phase 4: Scale** | 3 months | Sharding, read replicas, async logging, monitoring | $200K |
| **Phase 5: Premium** | 3 months | DPI integration, TCP RST injection, VPN detection | $300K |

**Total: 15 months, ~$1.1M engineering investment**

### 9.2 Critical Success Factors

1. **Multi-tenancy is non-negotiable** — without it, no ISP will adopt
2. **Edge latency <5ms** — ISPs will not accept 300ms DNS delays
3. **Zero-touch deployment** — parents must not configure anything manually
4. **CPE router control** — must be ISP-managed for MAC-based blocking
5. **Fail-open design** — if edge cache is stale, ALLOW (not BLOCK) to avoid outages

### 9.3 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| ECH (Encrypted Client Hello) breaks SNI inspection | High | DoH bypass detection fails | Move to IP-level DoH blocking |
| VPN over TCP 443 undetectable | High | Complete bypass possible | On-device agent + parent alert |
| GDPR data localization | Medium | Must store EU data in EU | Regional deployment + encryption |
| False positives (block legitimate sites) | Medium | Customer complaints | Unknown domain learning + parent override |
| CPE firmware update complexity | High | ISP deployment delays | OTA update system, gradual rollout |

---

## 10. Verdict

### Current System: **B2C Consumer Viable** ✅
- Works for tech-savvy parents willing to configure routers
- Core DNS policy engine is sound
- Scalable to 10K-50K direct consumers

### For ISP Deployment: **Requires Major Rebuild** 🔴
- Missing: multi-tenancy, edge caching, RADIUS integration, subscriber IDs
- Must transform from "API-based policy server" to "edge-resident policy cache"
- Estimated: 12-18 months, $800K-$1.5M engineering investment

### For Single ISP Pilot: **Feasible in 6 months** ⚠️
- Hardcode single tenant (skip multi-tenancy for pilot)
- Deploy 2-3 POPs with Redis policy cache
- Build RADIUS/DHCP integration for one ISP
- Manual CPE router configuration (pilot only)
- Estimated: 6 months, $400K investment

---

**End of ISP Architecture Document**

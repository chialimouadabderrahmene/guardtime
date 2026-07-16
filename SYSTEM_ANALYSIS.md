# GuardTime Parent — System Architecture & Security Analysis
## Acquisition-Grade Technical Review

**Reviewer:** Senior System Architect & Cybersecurity Expert  
**Date:** April 2026  
**Scope:** Flutter App + NestJS Backend + DNS Filtering

---

## 1. System Architecture Overview

### Core Concept
GuardTime Parent is a **remote DNS-policy-based parental control platform** operating at the network infrastructure level:

1. Parents configure rules via Flutter mobile app
2. Backend stores rules in PostgreSQL
3. When child device visits a website, home DNS resolver queries backend API
4. Backend responds: ALLOW (real IP) or BLOCK (0.0.0.0)
5. Child's device receives blocked response and cannot connect

### Architecture Diagram

```
PARENT APP (Flutter iOS/Android)
    │ POST /sessions/start {deviceId, duration}
    ▼
BACKEND API (NestJS)
    │ JWT auth + validation
    ▼
DATABASE (PostgreSQL)
    │ INSERT session (ACTIVE, startedAt, remainingMinutes)
    ▼
Response: {sessionId, expiresAt}

CHILD'S DEVICE (PlayStation/PC/Phone)
    │ DNS query: "fortnite.com?"
    ▼
HOME ROUTER (dnsmasq/Unbound)
    │ HTTP GET /dns/policy/check?sourceIp=192.168.1.105&domain=fortnite.com
    ▼
BACKEND: DnsPolicyService.checkPolicy()
    │
    ├── 1. Find device by IP
    ├── 2. STRICT_MODE: block DoH resolvers (dns.google, cloudflare-dns.com)
    ├── 3. Check FULL INTERNET LOCK
    ├── 4. Check MANUAL BLOCK status
    ├── 5. Check session expiration (elapsed > duration?)
    ├── 6. Check blocked domains (exact + wildcard match)
    └── 7. ALLOW (log unknown domain for learning)
    ▼
Response: {action: 'ALLOW'|'BLOCK', blockIp: '0.0.0.0', reason}
    ▼
DNS returns real IP or 0.0.0.0 → device connects or fails
```

---

## 2. Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Mobile Client | Flutter 3.x + Riverpod + GoRouter | Parent control interface |
| API | NestJS + Express | REST API, auth, business logic |
| ORM | Prisma | Type-safe database queries |
| Database | PostgreSQL 14+ | Persistent storage |
| Cache | Redis (cache-manager) | DNS policy cache (30s TTL) |
| Auth | JWT (15min access, 7d refresh) + bcrypt | Parent authentication |
| DNS | External resolver calling API | Policy decision point (not a DNS server) |
| Hosting | Railway (current) | Container deployment |

---

## 3. DNS Filtering Deep Analysis

### DNS Policy Decision Tree (Priority Order)

```
Priority 1: STRICT_MODE DoH blocking
  → Blocks dns.google, cloudflare-dns.com, etc.
  → Prevents circumvention via encrypted DNS

Priority 2: FULL INTERNET LOCK
  → device.internetLocked = true → BLOCK all

Priority 3: MANUAL BLOCK
  → device.status = 'BLOCKED' → BLOCK all

Priority 4: SESSION EXPIRATION
  → active session AND remaining <= 0 → BLOCK
  → Core gaming time enforcement

Priority 5: DOMAIN BLOCKLIST
  → Exact or wildcard match in blockedDomains table
  → Check per-child category settings
  → Category blocked AND child disabled → BLOCK

Priority 6: ALLOW
  → Log to unknownDomainLog for admin review
  → Update device.lastDnsSeenAt
```

### Key DNS Features

| Feature | Implementation | Assessment |
|---------|---------------|------------|
| **DoH Blocking** | Hardcoded 14 resolvers (dns.google, cloudflare-dns.com, etc.) | ✅ Good — prevents trivial bypass |
| **Wildcard Matching** | Splits domain into suffix candidates, checks all | ✅ Good — *.youtube.com blocks all subdomains |
| **Unknown Domain Learning** | Logs unblocked domains, sorts by hit count | ✅ Excellent — admin can categorize popular sites |
| **Cache Layer** | Redis 30s TTL per (sourceIp, domain) | ⚠️ Acceptable — reduces load but delays policy updates |
| **Session-Aware** | Checks elapsed time against duration at query time | ✅ Strong — enforces time limits even without app running |

### Critical Finding: IP-Based Identification

```typescript
// DnsPolicyService identifies devices by IP:
const device = await this.prisma.device.findFirst({
  where: {
    OR: [{ ipAddress: sourceIp }, { dnsSourceIp: sourceIp }],
  },
});
```

**Problems:**
- NAT sharing: Multiple children behind same router IP → treated as one device
- Dynamic IPs: Router reboot assigns new IPs → device becomes invisible
- Cellular switch: WiFi to 4G/5G → IP changes completely → full access restored
- IPv4/IPv6 mismatch: DNS query uses IPv6, device records IPv4 → no match

**Recommendation:** Implement device authentication tokens:
```
DNS query includes: ?deviceToken={uuid}&domain=...
Token is unique per device, survives IP changes
```

---

## 4. Security & Bypass Analysis

### Strengths

| Feature | Grade | Notes |
|---------|-------|-------|
| DoH/DoT Blocking | ✅ Strong | 14 known resolvers blocked in STRICT_MODE |
| Session Enforcement | ✅ Strong | Time limits enforced at DNS level |
| Category Filtering | ✅ Good | Per-child category controls with wildcards |
| Unknown Domain Learning | ✅ Excellent | Crowdsourced categorization system |
| JWT Token Rotation | ✅ Strong | Refresh tokens regenerated on each use |
| Account Lockout | ✅ Good | 5 failed attempts = 15min lock |
| Input Validation | ✅ Good | DTO whitelist + forbidNonWhitelisted |
| Audit Logging | ✅ Good | DNS queries, login attempts, account deletion |

### Weaknesses & Bypass Vectors

#### 🔴 CRITICAL — Session Expiration Gap

**Severity: HIGH**

```
Problem: DNS blocking only prevents NEW connections

Bypass:
  1. Child starts Fortnite at 14:00 (60min session)
  2. Session expires at 15:00
  3. But Fortnite TCP connection established at 14:30
  4. DNS blocks NEW queries at 15:00
  5. Existing connection remains active
  6. Child continues playing 5-30 min past limit
```

**Fix Options:**
- Short TTL responses (60s) → force frequent re-queries
- Application-level enforcement (child agent kills processes)
- Session violation detection + parent alert

#### 🔴 CRITICAL — VPN Bypass

**Severity: HIGH**

```
Problem: VPNs tunnel traffic outside home network

Bypass:
  1. Child installs VPN app
  2. DNS queries go through VPN tunnel
  3. VPN provider's DNS used, not home router
  4. GuardTime backend never consulted
  5. Full internet access restored
```

**Fix Options:**
- Router-level Deep Packet Inspection (DPI) → block VPN protocols
- Child agent detects VPN interfaces (tun0) → alert parent
- Network-level VPN port blocking (1194/UDP, 51820/UDP)

#### 🟠 HIGH — Cache Delay

**Severity: MEDIUM**

```
Problem: Redis caches decisions for 30 seconds

Impact: Policy changes (session stop, new block) delayed by up to 30s
Fix: Reduce TTL to 5-10s or implement cache invalidation on state change
```

#### 🟡 MEDIUM — Direct IP Access

**Severity: LOW**

```
Problem: DNS filtering only blocks domain names

Bypass: Access site by direct IP (e.g., https://104.244.42.193)

Mitigation: Most modern sites use CDN/shared hosting and block direct IP access
```

### Security Improvements Roadmap

| Priority | Improvement | Effort |
|----------|-------------|--------|
| **P0** | Device tokens (replace IP-based ID) | Medium |
| **P1** | Short TTL for active sessions | Low |
| **P1** | VPN detection in child agent | Low |
| **P2** | Router DPI integration | High |
| **P2** | Certificate pinning | Low |
| **P2** | Geo-fencing (cellular block) | Medium |

---

## 5. Performance & Scalability

### Current → 10K Users: ✅ Ready

- ~500 concurrent families, ~3K DNS queries/min peak
- 2 ECS instances + RDS handles comfortably

### 10K → 100K Users: ⚠️ Optimization Required

**Bottlenecks:**
- DNS query volume: 30K/min = 500/sec, each doing 3-5 DB queries
- Database connection pool saturation
- Cache miss rate on diverse domains

**Required:**
- 4-6 ECS instances with auto-scaling
- RDS read replicas (2-3)
- Redis cluster (2 shards)
- Materialized view for active sessions
- Async DNS logging (Kafka/SLS, batch inserts)

### 100K → 1M Users: 🔴 Major Changes

**Critical issues:**
- 300K DNS queries/min (5K/sec) → single API endpoint hot path
- PostgreSQL write amplification: 5K writes/sec on dnsQueryLog
- Redis churn: 30s TTL with diverse domains

**Required architecture:**
- Sharding by region (EU/US/Asia backends)
- Materialized policy cache in Redis (pre-computed ALLOW/BLOCK)
- Edge computing: lightweight policy caches at CDN nodes
- Async audit logging (batch inserts every 30s)
- Database sharding by family_id

---

## 6. ISP / Telecom Integration

### Current: B2C Consumer Model
- Parents manually configure router DNS
- Single backend, single database
- Device identified by IP (fragile)
- Railway hosting (single region)

### ISP-Ready: B2B2C Requirements

| Requirement | Current | Gap |
|-------------|---------|-----|
| **Multi-tenancy** | Single-tenant | 🔴 Major — needs tenant isolation |
| **White-label** | Fixed branding | 🔴 Major — dynamic theming |
| **ISP admin portal** | None | 🔴 Major — B2B dashboard needed |
| **Bulk provisioning** | Manual per-device | 🔴 Major — API for 10K+ devices |
| **DNS latency** | 150-300ms | 🟡 Medium — need <10ms edge caching |
| **Subscriber ID** | IP-based | 🟡 Medium — RADIUS/DHCP integration |
| **Regional deployment** | Single region | 🟡 Medium — multi-region required |
| **SLA guarantees** | None | 🟡 Medium — 99.9% contract |

### ISP Integration Architecture

```
ISP NETWORK EDGE (POP)
    │
    ├── DNS Resolver Cluster (Unbound/Bind)
    │   └── Forward to: Local Policy Cache
    │
    ├── Local Policy Cache (Redis)
    │   └── Pre-loaded subscriber policies
    │   └── Synced from central every 5min
    │   └── <1ms lookup (no Internet round-trip)
    │
    └── GuardTime Central Backend (Cloud)
        ├── Policy management API (parent app)
        ├── Policy distribution to ISP caches
        ├── Analytics aggregation (anonymized)
        └── Billing & tenant management
```

---

## 7. Final Assessment

### Strengths
- ✅ Sophisticated DNS policy engine with session awareness
- ✅ DoH bypass prevention (STRICT_MODE)
- ✅ Unknown domain learning system (crowdsourced categorization)
- ✅ Strong authentication (JWT rotation, account lockout)
- ✅ Clean Flutter UI with offline support and crash protection
- ✅ Well-structured NestJS backend with Prisma ORM

### Weaknesses
- 🔴 IP-based device identification (NAT, dynamic IP, cellular bypass)
- 🔴 Session expiration gap (existing connections persist past limit)
- 🔴 VPN bypass (no effective mitigation beyond DoH blocking)
- 🔴 No multi-tenancy (blocks ISP white-label deployment)
- ⚠️ 30s DNS cache TTL (delays policy enforcement)
- ⚠️ Single-region deployment (latency for global users)
- ⚠️ No router-level integration (manual DNS setup required)

### Acquisition Readiness: CONDITIONAL

**For Consumer Market (B2C):** ✅ VIABLE
- Core functionality works for tech-savvy parents
- Manual setup acceptable for early adopters
- Scalable to 10K-50K users with moderate investment

**For ISP/Telecom Market (B2B2C):** 🔴 NOT READY
- Missing multi-tenancy, white-label, admin portal
- IP-based identification incompatible with ISP infrastructure
- No RADIUS/DHCP integration for automatic device discovery
- Requires 6-12 months development for ISP readiness

### Investment Recommendation

| Use Case | Status | Required Investment |
|----------|--------|-------------------|
| Direct-to-consumer app | ✅ Ready | $50K-100K (marketing, minor fixes) |
| SMB/School deployment | ⚠️ Possible | $200K-400K (multi-tenant, admin portal) |
| Major ISP white-label | 🔴 Not ready | $500K-1M (full B2B2C rebuild) |

---

**End of Analysis**

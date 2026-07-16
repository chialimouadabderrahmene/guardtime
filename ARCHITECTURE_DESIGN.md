# GuardTime Parent — Production Architecture
## Alibaba Cloud Infrastructure Blueprint

**Date:** April 2026 | **Cloud:** Alibaba Cloud | **Tier:** Production-Grade

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CLIENT LAYER (Flutter Apps)                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                    │
│  │ Parent   │ │ Parent   │ │ Parent   │                                    │
│  │ iOS      │ │ Android  │ │ iOS      │                                    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘                                    │
└───────┼────────────┼────────────┼────────────────────────────────────────────┘
        │            │            │  HTTPS/TLS 1.3
        └────────────┴────────────┘
┌─────────────────────────────────────────────────────────────────────────────┐
│  NETWORK LAYER (Alibaba Cloud)                                              │
│  ┌─────────────────────────┐   ┌─────────────────────────┐                 │
│  │  CDN (DCDN)             │──▶│  WAF                    │                 │
│  │  Edge caching, DDoS     │   │  SQLi/XSS/Bot filter    │                 │
│  └─────────────────────────┘   └────────────┬────────────┘                 │
│                                             │                               │
│  ┌──────────────────────────────────────────┴──────────────────────────┐    │
│  │  SLB (Server Load Balancer) — Layer 7                              │    │
│  └──────┬──────────────────────┬──────────────────────┬───────────────────┘    │
│         │                      │                      │                       │
│  ┌──────┴──────┐        ┌──────┴──────┐        ┌──────┴──────┐              │
│  │ ECS (AZ-1a) │        │ ECS (AZ-1b) │        │ ECS (AZ-1c) │              │
│  │ NestJS      │        │ NestJS      │        │ NestJS      │              │
│  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘              │
│         │                      │                      │                       │
│  ┌──────┴──────────────────────┴──────────────────────┴──────┐               │
│  │  ElastiCache Redis (Session, Rate limits, JWT blacklist)  │               │
│  └─────────────────────────────┬───────────────────────────────┘               │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────────────┐
│  DATA LAYER (VPC)            │                                               │
│                              │                                               │
│  ┌───────────────────────────┴───────────────────────────────┐               │
│  │  ApsaraDB RDS PostgreSQL (Primary+Standby+Read Replica)   │               │
│  │  Automated backups, PITR, SSL encryption                  │               │
│  └─────────────────────────────────────────────────────────────┘               │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────┐             │
│  │  OSS (Static assets, Profile images, Log archives)            │             │
│  └───────────────────────────────────────────────────────────────┘             │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. DNS & Domain Flow

| Step | Component | Action | Service |
|------|-----------|--------|---------|
| 1 | User App | DNS query `api.guardtime.com` | Cloud DNS Premium |
| 2 | DNS | Returns CDN CNAME (geo-routed) | Cloud DNS |
| 3 | CDN | Cache hit or pass-through | DCDN |
| 4 | WAF | Security inspection | WAF |
| 5 | SLB | SSL termination, route to ECS | SLB Layer 7 |
| 6 | ECS | NestJS processes request | ECS |
| 7 | Database | Read/write data | ApsaraDB RDS |
| 8 | Response | Return via reverse path | - |

### SSL Configuration
- **Certificate:** Wildcard `*.guardtime.com`
- **TLS:** 1.3 minimum (1.2 fallback)
- **HSTS:** 31536000s, includeSubDomains
- **Auto-renew:** 30 days before expiry

---

## 3. Alibaba Cloud Services

| Service | Purpose | Specs |
|---------|---------|-------|
| **ECS** | NestJS hosting | 2vCPU/4GB, Docker, Auto-scaling (2-6), 3 AZs |
| **ApsaraDB RDS** | PostgreSQL | HA Edition, 2vCPU/8GB, 100GB SSD, 7-day backups |
| **SLB** | Load balancing | Layer 7, HTTPS termination, Health check 5s |
| **DCDN** | Edge performance | Global nodes, Static caching, DDoS protection |
| **WAF** | API security | SQLi/XSS/Bot filtering, Custom rules |
| **VPC** | Network isolation | 10.0.0.0/16, Private subnets, NAT Gateway |
| **ElastiCache** | Caching | Redis 6.0, Sessions, Rate limits |
| **OSS** | Object storage | Static assets, Images, Logs |
| **ActionTrail** | Audit | API logging, 180-day retention |

---

## 4. Security Layer

### VPC Design
```
VPC 10.0.0.0/16
├── Public Subnet 10.0.1.0/24: NAT Gateway, Bastion
├── Private App 10.0.2.0/24: ECS instances
└── Private Data 10.0.10.0/24: ApsaraDB RDS
```

### Security Groups
| Group | Ingress | Egress |
|-------|---------|--------|
| SLB | 443/tcp (Internet) | 80/tcp (ECS) |
| ECS | 80/tcp (SLB only) | 5432/tcp (RDS), 443/tcp |
| RDS | 5432/tcp (ECS only) | None |
| Redis | 6379/tcp (ECS only) | None |

### CORS & JWT Flow
```
1. Request ──▶ WAF checks IP reputation
2. Request ──▶ SLB terminates SSL
3. Request ──▶ ECS validates JWT in Authorization header
4. Token ────▶ Verify signature with JWT_SECRET
5. Request ──▶ Controller checks permissions
6. Request ──▶ Service processes business logic
7. Query ────▶ RDS via SSL connection
8. Response ◀── JSON with new tokens (if refreshed)
```

---

## 5. Backend Architecture (NestJS)

```
┌─────────────────────────────────────────────────────────────────┐
│  NESTJS MODULE STRUCTURE                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │  AuthModule │    │ ParentsModule│    │ ChildrenModule│      │
│  │  - register │    │  - profile  │    │  - CRUD     │        │
│  │  - login    │    │  - delete   │    │  - limits   │        │
│  │  - refresh  │    │             │    │             │        │
│  │  - logout   │    │             │    │             │        │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
│         │                  │                  │                │
│  ┌──────┴──────────────────┴──────────────────┴──────┐          │
│  │  CommonModule (Guards, Filters, Interceptors)      │          │
│  │  - JwtAuthGuard (token validation)                │          │
│  │  - GlobalExceptionFilter (sanitized errors)       │          │
│  │  - RateLimitGuard (throttling)                   │          │
│  └─────────────────────┬──────────────────────────────┘          │
│                       │                                         │
│  ┌────────────────────┴────────────────────────────────────┐  │
│  │  PrismaService ──▶ ApsaraDB RDS PostgreSQL (SSL)         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Request Lifecycle
```
Request ──▶ WAF (security scan)
    │
    ▼
SLB ──────▶ ECS Instance (Docker container)
    │
    ▼
GlobalExceptionFilter (catch all errors)
    │
    ▼
JwtAuthGuard (validate token)
    │
    ▼
Controller (route handler)
    │
    ▼
Service (business logic)
    │
    ▼
Prisma ───▶ PostgreSQL (SSL)
    │
    ▼
Response (JSON + new tokens if refreshed)
```

---

## 6. Database Design

### Entity Relationships
```
┌─────────┐       ┌─────────┐       ┌─────────┐
│  User   │1────N │  Child  │1────N │ Device  │
│(Parent) │       │         │       │         │
└────┬────┘       └────┬────┘       └────┬────┘
     │                 │                 │
     │                 │            ┌────┴────┐
     │                 │            │ Session │
     │                 │            └─────────┘
     │            ┌────┴────┐
     │            │ Gateway │
     │            └─────────┘
┌────┴────┐
│Subscription│
└─────────┘
```

### Key Tables
| Table | Purpose | Scaling Strategy |
|-------|---------|------------------|
| `users` | Parent accounts | Partition by region, index on email |
| `children` | Child profiles | FK to users, index on userId |
| `devices` | Device registry | FK to children, index on childId |
| `sessions` | Active sessions | TTL, archive old records |
| `usage_logs` | Analytics data | Time-series partitioning, OSS archive |
| `audit_logs` | Security events | Write-heavy, index on timestamp |

### Scaling Strategy
- **Read scaling:** RDS Read Replicas for analytics queries
- **Write scaling:** Connection pooling (PgBouncer), application-level sharding by region
- **Archival:** Move `usage_logs` >90 days to OSS (Parquet format)
- **Backup:** Automated daily backups, PITR 7 days

---

## 7. Scalability Design

### Horizontal Scaling
```
┌─────────────────────────────────────────────┐
│  Auto-scaling Group (min:2, max:6)          │
│                                             │
│  Metric triggers:                          │
│  - CPU > 70% for 2 min ──▶ Scale +1        │
│  - CPU < 30% for 5 min ──▶ Scale -1        │
│  - Request latency > 500ms ──▶ Scale +2    │
│                                             │
│  Cooldown: 300 seconds between scaling      │
└─────────────────────────────────────────────┘
```

### Caching Strategy
| Layer | Cache | TTL | Use Case |
|-------|-------|-----|----------|
| CDN | DCDN edge | 1h | Static assets, API responses |
| Application | Redis | 15m | User sessions, device lists |
| Database | RDS cache | - | Query result caching |

### Stateless Backend
- No local session storage
- JWT tokens contain all auth state
- Shared Redis for rate limiting
- Database for persistent state
- Any ECS instance can handle any request

---

## 8. Reliability & Failover

### Health Checks
```
SLB ──▶ ECS every 5s
  Path: /health
  Timeout: 3s
  Healthy: 2 consecutive 200s
  Unhealthy: 3 consecutive failures
```

### Database Failover
| Scenario | Response | Recovery |
|----------|----------|----------|
| Primary failure | Automatic failover to standby | < 30s RTO |
| AZ failure | RDS multi-AZ activation | < 60s RTO |
| Read replica lag | Route reads to primary | Automatic |

### Backup Strategy
| Type | Frequency | Retention | Storage |
|------|-----------|-----------|---------|
| Automated | Daily | 7 days | OSS Standard |
| Manual | On-demand | 30 days | OSS Standard |
| Binlog | Continuous | 7 days | OSS Infrequent Access |

### Disaster Recovery
- **RPO:** < 5 minutes (binlog streaming)
- **RTO:** < 30 minutes (automated failover)
- **Cross-region:** Read replica in secondary region for DR

---

## 9. Data Flow Example

### Scenario: Parent Locks Child's Gaming Session

```
1. Parent taps "Stop Session" in Flutter app
   └─▶ App sends: POST /sessions/{id}/stop
       Headers: Authorization: Bearer {jwt}

2. Request travels:
   Device ──▶ ISP ──▶ Alibaba Cloud DNS ──▶ CDN edge node

3. CDN checks cache (miss for POST) ──▶ Forward to origin

4. WAF inspects:
   ✓ IP not on blacklist
   ✓ Request rate within limit
   ✓ Payload size valid
   ✓ No SQL injection patterns
   └─▶ Pass to SLB

5. SLB:
   ✓ SSL termination
   ✓ Route to healthy ECS (AZ-1b)
   └─▶ Forward HTTP request

6. ECS NestJS backend:
   ✓ GlobalExceptionFilter wraps execution
   ✓ JwtAuthGuard validates JWT signature
   ✓ Extract userId from token payload
   ✓ RateLimitGuard checks user quota
   ✓ SessionsController receives request
   ✓ SessionsService validates session ownership
   ✓ Prisma updates database: session.status = 'stopped'
   ✓ Redis invalidates cached device list
   └─▶ Returns 200 OK with session data

7. Response travels reverse path:
   ECS ──▶ SLB ──▶ (no CDN cache for 200 OK dynamic) ──▶ Internet ──▶ Device

8. Flutter app:
   ✓ Parses response
   ✓ Updates UI to show "Session Stopped"
   ✪ Child's console loses internet within seconds

Total latency: ~150-300ms (Europe to Frankfurt region)
```

---

## 10. Security Summary

| Layer | Protection | Implementation |
|-------|------------|----------------|
| **Edge** | DDoS mitigation | CDN + WAF rate limiting |
| **Network** | VPC isolation | Private subnets, Security groups |
| **Transport** | Encryption | TLS 1.3, HSTS, Certificate pinning |
| **Application** | Authentication | JWT (access 15m, refresh 7d), bcrypt passwords |
| **Application** | Authorization | Role-based guards (Parent/Child/Admin) |
| **Application** | Input validation | Whitelist DTOs, SQL injection prevention |
| **Application** | Rate limiting | 5 login/min, 10 register/min, 100 API/min |
| **Application** | Brute force | Account lockout after 5 failures (15 min) |
| **Data** | Encryption at rest | RDS TDE, OSS server-side encryption |
| **Data** | Encryption in transit | SSL/TLS for all connections |
| **Data** | Access control | Least privilege RAM roles |
| **Audit** | Logging | ActionTrail for all API calls |

---

## Deployment Checklist

1. **Pre-deployment:**
   - [ ] Set `JWT_SECRET` (32+ chars, random)
   - [ ] Set `JWT_REFRESH_SECRET` (different, 32+ chars)
   - [ ] Set `CORS_ORIGINS` (comma-separated allowlist)
   - [ ] Set `NODE_ENV=production`
   - [ ] Configure Cloud DNS records
   - [ ] Upload SSL certificate

2. **Infrastructure:**
   - [ ] Create VPC with private subnets
   - [ ] Deploy ECS instances in auto-scaling group
   - [ ] Provision ApsaraDB RDS (HA)
   - [ ] Configure SLB with health checks
   - [ ] Enable DCDN with origin pull
   - [ ] Configure WAF rules

3. **Database:**
   - [ ] Run Prisma migrations
   - [ ] Verify connection pooling
   - [ ] Enable automated backups
   - [ ] Configure PITR

4. **Monitoring:**
   - [ ] Enable CloudMonitor
   - [ ] Set up alert rules (CPU, memory, disk)
   - [ ] Configure log service (SLS)
   - [ ] Test failover scenarios

---

**End of Architecture Document**

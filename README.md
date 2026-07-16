<div align="center">

# 🛡️ GuardTime Parent

### The Complete Digital Parenting Platform

**Smart parental controls for every device — phones, tablets, gaming consoles, smart TVs, and more.**

[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com)
[![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?style=flat-square&logo=flutter)](https://flutter.dev)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://docker.com)

[Features](#-features) · [Architecture](#-architecture) · [Getting Started](#-getting-started) · [API Docs](#-api-documentation) · [Deployment](#-deployment)

</div>

---

## 📖 Overview

GuardTime Parent gives families a single command center to manage screen time across **every device in the home**. Parents set rules once — daily time limits, bedtime schedules, gaming session caps — and the system enforces them automatically across Android phones, iPhones, Xbox, PlayStation, Nintendo Switch, Smart TVs, and PCs.

Unlike solutions that only cover phones or websites, GuardTime works at the **network level**: a custom DNS server intercepts traffic, a gateway agent sits on the home router, and dedicated platform adapters reach into Android and iOS at the OS level. When time is up, the internet simply stops — no arguments needed.

---

## ✨ Features

### 👨‍👩‍👧 Family Management
- **Child profiles** with individual rules, avatars, and age-appropriate settings
- **Multi-device support** — manage up to dozens of devices per family from one app
- **Role-based access** — Parent, Child Device, Gateway, and Admin roles

### ⏱ Session & Time Control
- Start, pause, resume, extend, and stop gaming sessions remotely
- Bedtime auto-lock with midnight-wrap scheduling
- Daily screen time limits with automatic enforcement
- Reward extra time for good behaviour — one tap from the parent app

### 🌐 DNS-Level Internet Filtering
- Custom DNS server blocks domains in real-time (port 53, UDP + TCP)
- 30-second Redis cache for sub-millisecond policy decisions
- Block categories: **Gaming · Streaming · Social · Adult · Custom**
- Full Internet Lock — cuts all online traffic on demand
- STRICT MODE blocks known DoH/VPN resolvers to prevent bypass

### 🔐 Bypass Detection & Protection Scoring
- Detects when a child changes DNS or uses a VPN (0–10 min window)
- Escalates to `COMPROMISED` status after 3 bypass attempts
- Per-device **Protection Score** (0–100) with HIGH / MEDIUM / LOW rating
- Insights dashboard with top domains, recommendations, and breakdown

### 📱 Platform Adapters
| Platform | Online Control | Offline Control | Method |
|---|:---:|:---:|---|
| Android | ✅ | ✅ | Child agent app (Device Admin) |
| iOS / iPad | ✅ | ✅ | Apple Family Controls |
| Xbox | ✅ | ✅ | Microsoft Family Safety OAuth |
| PlayStation | ✅ | 📋 Guide | DNS block + Sony PSN guide |
| Nintendo Switch | ✅ | 📋 Guide | DNS block + Nintendo app guide |
| Smart TV | ✅ | 📋 Guide | DNS block via router |
| PC / Mac | ✅ | 📋 Guide | DNS block + Steam/OS guides |

### 📊 Analytics & Reporting
- Daily and weekly usage reports per child and per device
- App-level tracking (active app detection from agent)
- Domain learning system — classify unknown domains from real traffic
- Audit log for every enforcement and administrative action

### 🔔 Notifications
- Firebase Cloud Messaging (FCM HTTP v1) push notifications
- In-app notification centre with read/unread state
- Alerts for: time warnings, session ends, bypass detection, offline setup issues

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │  Flutter App │  │  Next.js Web │  │  Child Agent (Android)│  │
│  │  (iOS + And) │  │  (Dashboard) │  │  (Device Admin APK)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬────────────┘  │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │    HTTPS / TLS 1.3                      │ Agent polling
          ▼                 ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NestJS API (Port 3000)                     │
│  Auth · Parents · Children · Devices · Sessions · Rules        │
│  DNS Policy · Enforcement · Notifications · Gateway · Reports  │
│  Queue (BullMQ) · Scheduler · Audit · Protection · Analytics   │
└────────────────┬────────────────────────┬───────────────────────┘
                 │                        │
     ┌───────────▼──────────┐  ┌──────────▼──────────┐
     │  PostgreSQL (Prisma) │  │    Redis (BullMQ +  │
     │  Primary data store  │  │    Cache + Sessions) │
     └──────────────────────┘  └─────────────────────┘
                 │
     ┌───────────▼──────────┐
     │   DNS Service        │
     │  (Port 53, UDP+TCP)  │
     │  ALLOW / BLOCK rules │
     └──────────────────────┘
```

### Monorepo Structure

```
guardtime/
├── backend/                    # NestJS REST API
├── parent_app/                 # Flutter mobile app (iOS + Android)
├── web port client (parent-app)/  # Next.js web dashboard
├── dns-service/                # Standalone DNS filtering server
├── gateway-agent/              # Home router / Raspberry Pi agent
├── isp-adapter/                # ISP-level integration adapter
├── ARCHITECTURE_DESIGN.md      # Production infrastructure blueprint
├── PRODUCT_PITCH.md            # Product overview & business case
└── SYSTEM_ANALYSIS.md          # Technical system analysis
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| PostgreSQL | 16+ |
| Redis | 7+ |
| Flutter SDK | 3.x |
| Docker + Compose | Latest |

### Option 1 — Docker Compose (Recommended)

Spins up PostgreSQL, Redis, the NestJS API, and a mock gateway in one command.

```bash
git clone https://github.com/sheekaoff-maker/backendparent.git
cd backendparent

cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY

docker-compose up -d
```

The API will be live at `http://localhost:3000`. Swagger docs at `http://localhost:3000/api/docs`.

### Option 2 — Local Development

```bash
# 1. Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev

# 2. DNS Service
cd dns-service
npm install
cp .env.example .env
npm run dev

# 3. Flutter App
cd parent_app
flutter pub get
flutter run

# 4. Web Dashboard
cd "web port client (parent-app)"
npm install
npm run dev
```

---

## ⚙️ Configuration

Copy `backend/.env.example` to `backend/.env` and fill in the values:

| Variable | Description | Required |
|----------|-------------|:--------:|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_HOST` / `REDIS_URL` | Redis connection | ✅ |
| `JWT_SECRET` | Access token secret (≥ 32 chars) | ✅ |
| `JWT_REFRESH_SECRET` | Refresh token secret (≥ 32 chars, different) | ✅ |
| `JWT_EXPIRATION` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token TTL | `7d` |
| `ENCRYPTION_KEY` | AES-256 key for OAuth tokens (exactly 32 chars) | ✅ |
| `CORS_ORIGINS` | Comma-separated allowed origins | ✅ |
| `MICROSOFT_OAUTH_CLIENT_ID` | Xbox / Microsoft OAuth | Optional |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | Xbox / Microsoft OAuth | Optional |
| `FCM_PROJECT_ID` | Firebase push notifications | Optional |
| `FCM_CLIENT_EMAIL` | Firebase service account email | Optional |
| `FCM_PRIVATE_KEY` | Firebase service account private key | Optional |
| `STRICT_MODE` | Block DoH/VPN resolvers (`true`/`false`) | `false` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |

---

## 📡 API Documentation

Interactive Swagger UI is available at `http://localhost:3000/api/docs` when running locally.

### Key Endpoint Groups

| Group | Base Path | Description |
|-------|-----------|-------------|
| Authentication | `/auth` | Register, login, refresh, logout |
| Children | `/children` | Child profile CRUD |
| Devices | `/devices` | Device registration and management |
| Sessions | `/sessions` | Start / pause / extend / stop sessions |
| DNS Policy | `/dns/policy/check` | Real-time ALLOW/BLOCK decision |
| Enforcement | `/enforcement` | Block, unblock, sync rules |
| Gateway | `/gateway` | Register and pair home gateway |
| Notifications | `/notifications` | In-app notification centre |
| Reports | `/reports` | Usage analytics and reports |
| Protection | `/devices/:id/protection-score` | Device security score |
| Admin | `/admin/domains` | Blocklist and domain classification |
| Platform Support | `/platform-support` | Device setup guides and support matrix |

---

## 🔒 Security

- **JWT** access (15 min) + refresh (7 day) token pair — httpOnly in production
- **bcrypt** password hashing (12 rounds)
- **Account lockout** — 5 failed attempts triggers a 15-minute cooldown
- **Rate limiting** — 5 req/min on login, 10/min on register, 100/min general API
- **Helmet** HTTP security headers on every response
- **AES-256-CBC** encryption for stored OAuth tokens
- **Role-based guards** — PARENT, CHILD_DEVICE, GATEWAY, ADMIN
- **Audit log** — every enforcement and admin action is persisted
- **Input validation** — whitelist DTOs via `class-validator` (no unknown fields)
- **DNS bypass detection** — flags devices that stop sending DNS queries while locked

---

## 🚢 Deployment

### Railway (Backend)

The repo ships with `railway.toml` and `railway.json`. Connect the repo to a Railway project and set the environment variables — Railway will build from the Dockerfile automatically.

```toml
[build]
builder = "DOCKERFILE"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

### Vercel (Web Dashboard)

```bash
cd "web port client (parent-app)"
vercel --prod
```

### Production Infrastructure

See [`ARCHITECTURE_DESIGN.md`](./ARCHITECTURE_DESIGN.md) for the full production blueprint including:
- Alibaba Cloud multi-AZ ECS deployment
- ApsaraDB RDS PostgreSQL with HA standby
- SLB + WAF + CDN layer
- Auto-scaling group (min 2, max 6 instances)
- VPC design with private subnets
- RPO < 5 minutes, RTO < 30 minutes

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **API** | NestJS 10, TypeScript, Passport.js |
| **ORM** | Prisma 5 |
| **Database** | PostgreSQL 16 |
| **Cache / Queue** | Redis 7, BullMQ |
| **Mobile App** | Flutter 3, Riverpod, GoRouter, Dio |
| **Web Dashboard** | Next.js 14, React 18, TailwindCSS, Zustand |
| **DNS Server** | Node.js, dns2 |
| **Push Notifications** | Firebase Cloud Messaging (HTTP v1) |
| **Auth** | JWT (access + refresh), bcrypt, Microsoft OAuth |
| **Containerisation** | Docker, Docker Compose |
| **Deployment** | Railway (API), Vercel (Web), Alibaba Cloud (Prod) |

---

## 🗂 Database Schema

The Prisma schema defines **20 models**:

`User` · `Child` · `Device` · `Rule` · `Session` · `UsageLog` · `Command` · `CommandAck` · `Gateway` · `OAuthAccount` · `NotificationEvent` · `AuditLog` · `BlockedDomain` · `CategoryBlock` · `UnknownDomainLog` · `SetupGuide` · `DnsQueryLog` · `Subscription` · `PushToken` · `OfflineControlChecklist`

Run `npx prisma studio` inside the backend directory to explore the database visually.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

Please follow the existing code style and ensure all linting passes before opening a PR.

---

## 📄 License

This project is **private and unlicensed**. All rights reserved.

---

<div align="center">

Built with ❤️ by the GuardTime Team

</div>

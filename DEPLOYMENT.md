# GuardTime — Production Deployment (Ubuntu 24.04 + Docker Compose)

Single-VPS production stack: PostgreSQL, Redis, the NestJS backend, the DNS
service, and an Nginx reverse proxy — all Docker Compose, all on one host.

```
Internet ──80/443──> nginx ──> backend:3000 ──> postgres:5432
                                     │              redis:6379
Home routers ──53/udp,tcp──> dns-service ──> backend:3000 (internal)
```

Gateway Agent (Software Gateway) is **not** part of the core stack — see
[Gateway Agent](#gateway-agent-two-ways-to-run-it) below for why, and how
to run it either way.

## Contents

1. [First deployment](#1-first-deployment)
2. [Updates](#2-updates)
3. [Rollback](#3-rollback)
4. [Backups](#4-backups)
5. [Restoring](#5-restoring)
6. [SSL](#6-ssl)
7. [Environment variables](#7-environment-variables)
8. [Troubleshooting](#8-troubleshooting)
9. [Gateway Agent: two ways to run it](#gateway-agent-two-ways-to-run-it)
10. [Monitoring (optional)](#monitoring-optional)

---

## Prerequisites

- Ubuntu 24.04 VPS, a non-root sudo user, a domain name pointed at the VPS's IP.
- Docker Engine + Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  # log out and back in for the group change to take effect
  ```
- Ports 80, 443, and 53 (UDP+TCP) open in the VPS's firewall (`ufw allow 80,443,53`).

## 1. First deployment

```bash
git clone --recurse-submodules https://github.com/chialimouadabderrahmene/guardtime.git
cd guardtime
cp .env.prod.example .env.prod
nano .env.prod   # fill in every "change-me" / "your-domain.example" placeholder —
                 # see openssl rand -base64 32 for generating secrets
./deploy/deploy.sh
```

`deploy.sh` is idempotent (safe to re-run) and will:
- refuse to continue if `.env.prod` still has placeholder values,
- generate a temporary self-signed certificate if none exists yet (so nginx
  can start immediately — replace it with a real one via [SSL](#6-ssl)),
- build the backend/dns-service images, bring up postgres/redis/backend/dns-service/nginx,
  wait for the backend healthcheck, and print status.

Add `--with-monitoring` and/or `--with-gateway-agent` to also start those
optional profiles (see their sections below).

Migrations run automatically — the backend image's own startup command is
`npx prisma migrate deploy && node dist/main.js` (already the existing
convention in `backend/Dockerfile`; nothing new here).

## 2. Updates

```bash
./deploy/update.sh
```

Takes a backup first (skip with `--skip-backup`, not recommended), then
`git pull --ff-only` + submodule update, rebuilds images, and
`docker compose up -d` — Compose only recreates containers whose image
actually changed. Prisma migrations run automatically on backend startup,
same as first deploy. Records the pre-update commit to
`deploy/.last-deployed-commit` for `rollback.sh`.

## 3. Rollback

```bash
./deploy/rollback.sh              # back to the commit update.sh last recorded
./deploy/rollback.sh a1b2c3d      # or a specific commit/tag
```

Takes a safety backup, `git checkout`s the target ref, rebuilds, and
restarts. **Does not undo database migrations** — this project's own
migrations are additive-only (see `backend/prisma/migrations/`), so rolling
back code is normally safe without a database restore. If you specifically
need to undo a migration's data effects, restore from a backup taken before
that migration ran (see [Restoring](#5-restoring)).

## 4. Backups

```bash
./deploy/backup.sh                # keeps the last 14 of each (default)
./deploy/backup.sh --keep 30
```

Backs up Postgres (`pg_dump --format=custom`) to `backups/postgres/` and
Redis (BGSAVE + RDB copy) to `backups/redis/`, both timestamped, pruning
anything past the retention count.

**Schedule it** — add to root's crontab (`sudo crontab -e`):
```cron
0 3 * * * cd /opt/guardtime/guardtime && ./deploy/backup.sh >> /var/log/guardtime-backup.log 2>&1
```

Copy `backups/` off-host periodically (rsync/S3/etc.) — a backup that only
exists on the same VPS as the data it backs up doesn't survive a disk failure.

## 5. Restoring

```bash
./deploy/restore.sh --postgres backups/postgres/guardtime_20260722T030000Z.dump
./deploy/restore.sh --postgres <file> --redis backups/redis/guardtime_20260722T030000Z.rdb
```

Prompts for explicit confirmation (`restore`), stops backend/dns-service so
nothing writes mid-restore, runs `pg_restore --clean --if-exists`, restarts
everything, and waits for the backend healthcheck.

## 6. SSL

`deploy.sh` generates a temporary self-signed certificate so the stack can
start on first deploy. Replace it with a real one:

```bash
sudo apt install certbot
sudo certbot certonly --webroot -w ./nginx/certbot-www -d api.your-domain.example
sudo cp /etc/letsencrypt/live/api.your-domain.example/fullchain.pem ./nginx/certs/
sudo cp /etc/letsencrypt/live/api.your-domain.example/privkey.pem   ./nginx/certs/
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

**Renewal** — certbot's own timer renews the cert but won't update the copy
in `nginx/certs/` or reload nginx; add a small hook:
```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/guardtime-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
cp /etc/letsencrypt/live/api.your-domain.example/fullchain.pem /opt/guardtime/guardtime/nginx/certs/
cp /etc/letsencrypt/live/api.your-domain.example/privkey.pem   /opt/guardtime/guardtime/nginx/certs/
docker compose -f /opt/guardtime/guardtime/docker-compose.prod.yml exec nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/guardtime-nginx.sh
```

`nginx.conf` already has HTTP/2, TLS 1.2/1.3 only, OCSP stapling, and HSTS —
nothing further to configure. HTTP/3 is commented out (the base image
doesn't ship `http_v3_module`; see the comment in `nginx/nginx.conf` if you
want to switch images to enable it).

## 7. Environment variables

Every variable in `.env.prod.example` is real and already read by one of
the services — nothing invented for this deployment. Grouped by who reads
it:

| Variable | Read by | Notes |
|---|---|---|
| `POSTGRES_USER/PASSWORD/DB` | postgres, backend | backend builds `DATABASE_URL` from these |
| `REDIS_PASSWORD` | redis, backend | Redis now requires auth (dev compose doesn't — production does) |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | backend | must be ≥32 chars each — app refuses to boot otherwise |
| `ENCRYPTION_KEY` | backend | encrypts OAuth tokens / router admin credentials at rest, exactly 32 chars |
| `CORS_ORIGINS` | backend | comma-separated allowed browser origins |
| `MICROSOFT_OAUTH_*` | backend | Xbox integration — leave blank to disable |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | backend | push notifications — leave blank to disable (in-app center still works) |
| `STRICT_MODE`, `DNS_SERVICE_IP` | backend | DNS policy behavior |
| `API_DOMAIN`, `CERT_*_PATH`, `INTERNAL_CIDR` | nginx | `INTERNAL_CIDR=127.0.0.1/32` is correct for this single-VPS topology |
| `GATEWAY_AGENT_BACKEND_URL`, `GATEWAY_TOKEN` | gateway-agent (optional profile only) | see [Gateway Agent](#gateway-agent-two-ways-to-run-it) |
| `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_ROOT_URL` | grafana (optional profile only) | |

Full per-service detail lives in `backend/.env.example`, `dns-service/.env.example`,
and `gateway-agent/.env.example` — `.env.prod.example` is the aggregated
superset for this deployment.

## 8. Troubleshooting

**`docker compose ps` shows backend unhealthy / restarting**
```bash
docker compose -f docker-compose.prod.yml logs backend --tail 100
```
Common causes: a placeholder still in `.env.prod` (JWT_SECRET too short,
etc. — the app validates and refuses to boot, logging exactly which
variable is wrong), or Postgres not yet ready (backend's `depends_on`
condition already waits for `service_healthy`, so this should be rare).

**Migrations didn't apply**
```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate status
```
The backend's own startup command runs `prisma migrate deploy` every time
the container starts — if status shows pending migrations after a fresh
start, check the container logs for the actual Prisma error (most likely:
`DATABASE_URL` pointing at the wrong host/credentials).

**dns-service isn't resolving anything**
```bash
docker compose -f docker-compose.prod.yml logs dns-service --tail 100
dig @<vps-ip> example.com   # from another machine
```
Confirm UDP+TCP 53 are actually open at the cloud firewall level, not just
`ufw` — many providers (DigitalOcean, AWS security groups, etc.) filter
separately from the OS firewall.

**nginx won't start**
```bash
docker compose -f docker-compose.prod.yml logs nginx --tail 50
```
Almost always a missing/invalid certificate — confirm
`nginx/certs/fullchain.pem` and `privkey.pem` both exist and are valid PEM
files (`openssl x509 -in nginx/certs/fullchain.pem -noout -text`).

**"Cannot connect to the Docker daemon"**
`sudo systemctl start docker`, and confirm your user is in the `docker`
group (`groups $USER`) — re-login after `usermod -aG docker`.

**Out of disk space from logs**
Every service already has a bounded `json-file` logging driver
(`max-size: 10m, max-file: 5` — see the `x-logging` anchor in
`docker-compose.prod.yml`), so this should self-limit. If it's still an
issue, check `backups/` growth (pruned by `--keep`, default 14) and
`docker system df` for dangling build cache (`docker builder prune`).

---

## Gateway Agent: two ways to run it

Router Plugin Integration is this project's primary, recommended
enforcement path and needs no gateway-agent host at all for supported
routers. Gateway Agent (Software Gateway) is optional/experimental and, if
you use it, has **two** deployment options with a real tradeoff — this
isn't a Docker limitation to work around, it's an intentional distinction
already documented in `gateway-agent/Dockerfile.staging`:

| | systemd (recommended) | Docker (`--profile gateway-agent`) |
|---|---|---|
| Network access | Full — real root + iptables/nftables/conntrack against the actual LAN | `--network host` + `NET_ADMIN`/`NET_RAW` only |
| Isolation | None (by design — it needs to be the firewall) | Reduced container isolation (host networking) |
| Setup | `gateway-agent/deploy/guardtime-gateway-agent.service` | `docker compose --profile gateway-agent up -d` |

To use the systemd path instead of the Docker profile:
```bash
sudo mkdir -p /opt/guardtime/gateway-agent
sudo cp -r gateway-agent/* /opt/guardtime/gateway-agent/
cd /opt/guardtime/gateway-agent && npm ci --omit=dev
sudo cp .env.example /opt/guardtime/gateway-agent/.env   # fill in BACKEND_URL/GATEWAY_TOKEN
sudo cp deploy/guardtime-gateway-agent.service /etc/systemd/system/
sudo systemctl enable --now guardtime-gateway-agent
```

## Monitoring (optional)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile monitoring up -d
```

Prometheus (`127.0.0.1:9090`, loopback-only by design — reach it via
`ssh -L 9090:localhost:9090 your-vps`) scrapes `backend:3000/metrics` and
`dns-service:8080/metrics` using the pre-existing
`backend/deploy/prometheus/prometheus.yml`. Grafana
(`127.0.0.1:3300` loopback, or set `GRAFANA_ROOT_URL` and front it via
nginx if you want it public) auto-provisions the pre-existing
`backend/deploy/grafana/guardtime-fleet-dashboard.json` dashboard.
gateway-agent has no HTTP surface by design — its metrics need a
`node_exporter` textfile-collector on the gateway host itself; see the
comment in `prometheus.yml`.

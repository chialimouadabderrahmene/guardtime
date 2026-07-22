#!/usr/bin/env bash
# First deployment. Idempotent — safe to re-run if it fails partway through.
#
# Usage: ./deploy/deploy.sh [--with-monitoring] [--with-gateway-agent]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

PROFILES=()
for arg in "$@"; do
  case "$arg" in
    --with-monitoring) PROFILES+=(--profile monitoring) ;;
    --with-gateway-agent) PROFILES+=(--profile gateway-agent) ;;
    *) die "Unknown argument: $arg (expected --with-monitoring and/or --with-gateway-agent)" ;;
  esac
done

require_docker

if [[ ! -f "$ENV_FILE" ]]; then
  warn ".env.prod not found — creating it from .env.prod.example."
  cp "$ROOT_DIR/.env.prod.example" "$ENV_FILE"
  die "Fill in every 'change-me' placeholder in .env.prod, then re-run this script. Generate strong secrets with: openssl rand -base64 32"
fi

if grep -qE "change-me|your-domain\.example" "$ENV_FILE"; then
  die ".env.prod still has placeholder values ('change-me' / 'your-domain.example'). Fill in real secrets and domains before deploying to production."
fi

mkdir -p "$ROOT_DIR/nginx/certs" "$ROOT_DIR/nginx/certbot-www"

if [[ ! -f "$ROOT_DIR/nginx/certs/fullchain.pem" || ! -f "$ROOT_DIR/nginx/certs/privkey.pem" ]]; then
  warn "No TLS certificate found at nginx/certs/ — generating a temporary self-signed one so nginx can start."
  warn "Replace it with a real certificate (see DEPLOYMENT.md's SSL section, certbot) before going live — browsers/devices will reject a self-signed cert."
  API_DOMAIN="$(env_var API_DOMAIN)"
  openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
    -keyout "$ROOT_DIR/nginx/certs/privkey.pem" \
    -out "$ROOT_DIR/nginx/certs/fullchain.pem" \
    -subj "/CN=${API_DOMAIN:-localhost}" >/dev/null 2>&1
fi

log "Building images (backend, dns-service, dns-service)..."
compose build

log "Starting core stack (postgres, redis, backend, dns-service, nginx)..."
compose up -d "${PROFILES[@]}"

log "Waiting for backend to report healthy (up to 90s)..."
for i in $(seq 1 18); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
[[ "$status" == "healthy" ]] || warn "backend did not report healthy within 90s — check 'docker compose -f docker-compose.prod.yml logs backend'."

log "Running Prisma migration status check..."
compose exec -T backend npx prisma migrate status || warn "Could not confirm migration status — check backend logs."

log "Deployment complete. Current status:"
compose ps

cat <<'EOF'

Next steps:
  1. Point your domain's DNS A/AAAA record at this VPS.
  2. Issue a real TLS certificate (see DEPLOYMENT.md's SSL section), then:
       docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
  3. Create your first parent account through the app / API.
EOF

#!/usr/bin/env bash
# Shared helpers sourced by every script in deploy/. Not meant to be run directly.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
ENV_FILE="$ROOT_DIR/.env.prod"
BACKUP_DIR="$ROOT_DIR/backups"

log()  { printf '\033[1;34m[%s]\033[0m %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
warn() { printf '\033[1;33m[%s] WARNING:\033[0m %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die()  { printf '\033[1;31m[%s] ERROR:\033[0m %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; exit 1; }

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

require_env_file() {
  [[ -f "$ENV_FILE" ]] || die ".env.prod not found at $ENV_FILE — copy .env.prod.example to .env.prod and fill in every placeholder first."
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "docker is not installed. See DEPLOYMENT.md's prerequisites section."
  docker info >/dev/null 2>&1 || die "the Docker daemon isn't running (or this user can't reach it — try 'sudo usermod -aG docker \$USER' and re-login)."
}

# Reads a KEY=value pair out of .env.prod without exporting the whole file
# (avoids leaking every secret into this shell's environment for scripts
# that only need one or two values, e.g. POSTGRES_USER for pg_dump).
env_var() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d'=' -f2-
}

#!/usr/bin/env bash
# Restores Postgres (and optionally Redis) from a backup produced by
# backup.sh. Stops the backend first so nothing writes mid-restore.
#
# Usage:
#   ./deploy/restore.sh --postgres backups/postgres/guardtime_20260722T120000Z.dump
#   ./deploy/restore.sh --postgres <file> --redis backups/redis/guardtime_20260722T120000Z.rdb
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

require_docker
require_env_file

PG_FILE=""
REDIS_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --postgres) PG_FILE="$2"; shift 2 ;;
    --redis) REDIS_FILE="$2"; shift 2 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$PG_FILE" ]] || die "Usage: ./deploy/restore.sh --postgres <dump-file> [--redis <rdb-file>]"
[[ -f "$PG_FILE" ]] || die "File not found: $PG_FILE"
[[ -z "$REDIS_FILE" || -f "$REDIS_FILE" ]] || die "File not found: $REDIS_FILE"

echo
warn "This will REPLACE the current database contents with the backup."
warn "Postgres source: $PG_FILE"
[[ -n "$REDIS_FILE" ]] && warn "Redis source:    $REDIS_FILE"
read -r -p "Type 'restore' to continue: " CONFIRM
[[ "$CONFIRM" == "restore" ]] || die "Aborted."

POSTGRES_USER="$(env_var POSTGRES_USER)"; POSTGRES_USER="${POSTGRES_USER:-guardtime}"
POSTGRES_DB="$(env_var POSTGRES_DB)"; POSTGRES_DB="${POSTGRES_DB:-parental_control}"

log "Stopping backend and dns-service so nothing writes during restore..."
compose stop backend dns-service

log "Restoring Postgres from $PG_FILE ..."
# --clean --if-exists drops existing objects first so the restore isn't
# blocked by "relation already exists" — safe here because we've already
# confirmed with the operator that this is an intentional full replace.
compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner < "$PG_FILE"
log "Postgres restore complete."

if [[ -n "$REDIS_FILE" ]]; then
  log "Restoring Redis from $REDIS_FILE ..."
  compose stop redis
  docker cp "$REDIS_FILE" "$(compose ps -q redis)":/data/dump.rdb
  compose start redis
  log "Redis restore complete."
fi

log "Restarting backend and dns-service..."
compose start backend dns-service

log "Waiting for backend to report healthy (up to 90s)..."
for i in $(seq 1 18); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
[[ "$status" == "healthy" ]] || warn "backend is not healthy after restore — check 'docker compose -f docker-compose.prod.yml logs backend'."

log "Restore complete."

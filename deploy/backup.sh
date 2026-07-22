#!/usr/bin/env bash
# Backs up Postgres (pg_dump, custom format) and Redis (RDB snapshot).
# Run manually, or on a cron/systemd-timer schedule — see DEPLOYMENT.md's
# backup section for a sample crontab line.
#
# Usage: ./deploy/backup.sh [--keep N]   (default: keep the last 14 backups of each)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

require_docker
require_env_file

KEEP=14
if [[ "${1:-}" == "--keep" ]]; then
  KEEP="${2:?--keep requires a number}"
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR/postgres" "$BACKUP_DIR/redis"

POSTGRES_USER="$(env_var POSTGRES_USER)"
POSTGRES_DB="$(env_var POSTGRES_DB)"
POSTGRES_USER="${POSTGRES_USER:-guardtime}"
POSTGRES_DB="${POSTGRES_DB:-parental_control}"

PG_BACKUP_FILE="$BACKUP_DIR/postgres/guardtime_${TIMESTAMP}.dump"
log "Backing up Postgres ($POSTGRES_DB) to $PG_BACKUP_FILE ..."
compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$PG_BACKUP_FILE"
log "Postgres backup: $(du -h "$PG_BACKUP_FILE" | cut -f1)"

REDIS_BACKUP_FILE="$BACKUP_DIR/redis/guardtime_${TIMESTAMP}.rdb"
log "Triggering a Redis BGSAVE and copying the resulting dump.rdb ..."
REDIS_PASSWORD="$(env_var REDIS_PASSWORD)"
compose exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning BGSAVE >/dev/null
# BGSAVE is async — poll until the background save finishes rather than
# racing it (redis reports this via the LASTSAVE timestamp changing, or
# INFO persistence's rdb_bgsave_in_progress flag).
for i in $(seq 1 30); do
  in_progress="$(compose exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO persistence 2>/dev/null | grep -c 'rdb_bgsave_in_progress:1' || true)"
  [[ "$in_progress" == "0" ]] && break
  sleep 1
done
docker cp "$(compose ps -q redis)":/data/dump.rdb "$REDIS_BACKUP_FILE"
log "Redis backup: $(du -h "$REDIS_BACKUP_FILE" | cut -f1)"

log "Pruning backups older than the last $KEEP (per type)..."
for dir in "$BACKUP_DIR/postgres" "$BACKUP_DIR/redis"; do
  ls -1t "$dir" 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    log "  removing old backup: $dir/$old"
    rm -f "$dir/$old"
  done
done

log "Backup complete: $PG_BACKUP_FILE, $REDIS_BACKUP_FILE"

#!/usr/bin/env bash
# Pull latest code (+ submodules), rebuild, and recreate only the
# containers whose image actually changed. Takes a backup first.
#
# Usage: ./deploy/update.sh [--skip-backup]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

require_docker
require_env_file

SKIP_BACKUP=false
[[ "${1:-}" == "--skip-backup" ]] && SKIP_BACKUP=true

if [[ "$SKIP_BACKUP" == false ]]; then
  log "Taking a pre-update backup..."
  ./backup.sh
else
  warn "Skipping pre-update backup (--skip-backup passed)."
fi

log "Recording current commit for rollback (see deploy/rollback.sh)..."
cd "$ROOT_DIR"
PREV_COMMIT="$(git rev-parse HEAD)"
echo "$PREV_COMMIT" > "$ROOT_DIR/deploy/.last-deployed-commit"
log "Previous commit: $PREV_COMMIT"

log "Pulling latest code..."
git pull --ff-only
git submodule update --init --recursive

cd "$ROOT_DIR/deploy"

log "Building updated images..."
compose build

log "Recreating changed containers (unchanged ones are left running)..."
compose up -d

log "Waiting for backend to report healthy (up to 90s)..."
for i in $(seq 1 18); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done

if [[ "$status" != "healthy" ]]; then
  warn "backend is not healthy after the update. Consider: ./deploy/rollback.sh $PREV_COMMIT"
  exit 1
fi

log "Update complete."
compose ps

#!/usr/bin/env bash
# Roll back to a previous commit (defaults to whatever update.sh last
# recorded before its most recent update) and rebuild from there.
#
# Usage: ./deploy/rollback.sh [git-ref]
#   ./deploy/rollback.sh                 # rolls back to the commit update.sh recorded before its last run
#   ./deploy/rollback.sh a1b2c3d         # rolls back to a specific commit/tag
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
source ./lib.sh

require_docker
require_env_file

TARGET_REF="${1:-}"
if [[ -z "$TARGET_REF" ]]; then
  [[ -f "$ROOT_DIR/deploy/.last-deployed-commit" ]] || die "No git ref given and no deploy/.last-deployed-commit found — run: ./deploy/rollback.sh <git-ref>"
  TARGET_REF="$(cat "$ROOT_DIR/deploy/.last-deployed-commit")"
fi

log "Taking a safety backup before rolling back..."
./backup.sh

cd "$ROOT_DIR"
CURRENT_REF="$(git rev-parse HEAD)"
log "Current commit: $CURRENT_REF"
log "Rolling back to: $TARGET_REF"

git checkout "$TARGET_REF"
git submodule update --init --recursive

cd "$ROOT_DIR/deploy"
log "Rebuilding images at $TARGET_REF..."
compose build

log "Recreating containers..."
compose up -d

log "Waiting for backend to report healthy (up to 90s)..."
for i in $(seq 1 18); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null || echo starting)"
  [[ "$status" == "healthy" ]] && break
  sleep 5
done
[[ "$status" == "healthy" ]] || warn "backend is still not healthy after rollback — check 'docker compose -f docker-compose.prod.yml logs backend'."

cat <<EOF

Rolled back from $CURRENT_REF to $TARGET_REF.

IMPORTANT — database schema: this rollback does NOT undo Prisma
migrations. If the commit you rolled back past added a migration, that
migration's schema changes are still in the database (Prisma migrations
are additive-only in this project's own convention — see prisma/migrations/
— so this is normally harmless, but verify with:
  docker compose -f docker-compose.prod.yml exec backend npx prisma migrate status
If you need to actually restore the database to a prior state, use
./deploy/restore.sh against a backup taken before the migration you're
rolling back past.
EOF

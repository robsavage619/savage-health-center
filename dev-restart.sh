#!/usr/bin/env zsh
# Kills whatever is on :3000/:8000 and starts SHC from the given worktree (or latest).
# Usage: ./dev-restart.sh [worktree-path]
# Called by Claude automatically — don't edit the path selection logic.

set -e

REPO=/Users/robsavage/Projects/savage-health-center

# Always run from main repo — never a stale worktree
WT="${1:-$REPO}"

echo "▶ Restarting SHC from: $WT"

# Kill anything on the ports AND any stale uvicorn processes (prevents DuckDB lock conflicts)
lsof -ti :3000 -ti :8000 2>/dev/null | xargs kill -9 2>/dev/null || true
pkill -9 -f "uvicorn shc" 2>/dev/null || true
sleep 2

# Ensure data dir exists — symlink canonical worktree data if not already present
CANONICAL_DATA="$REPO/.claude/worktrees/zealous-pascal-9be780/backend/data"
if [[ ! -e "$WT/backend/data" ]]; then
  ln -sf "$CANONICAL_DATA" "$WT/backend/data"
fi
mkdir -p "$WT/backend/data/logs"
touch "$WT/backend/data/logs/shc.log"

# Frontend deps
if [[ ! -d "$WT/frontend/node_modules" ]]; then
  echo "▶ Installing frontend deps..."
  (cd "$WT/frontend" && npm install --silent)
fi

# Start backend
(cd "$WT/backend" && nohup uv run uvicorn shc.api.main:app \
  --host 127.0.0.1 --port 8000 --reload \
  --log-config ../logging.yaml \
  > data/logs/api.log 2>&1 &)
echo "  API PID $!"

# Start frontend
(cd "$WT/frontend" && nohup npm run dev > "$WT/backend/data/logs/web.log" 2>&1 &)
echo "  Web PID $!"

# Wait for ports
for i in {1..20}; do
  sleep 1
  API=$(lsof -ti :8000 2>/dev/null | head -1)
  WEB=$(lsof -ti :3000 2>/dev/null | head -1)
  [[ -n "$API" && -n "$WEB" ]] && break
done

echo ""
echo "✓ API  → http://127.0.0.1:8000  (PID $API)"
echo "✓ Web  → http://localhost:3000   (PID $WEB)"

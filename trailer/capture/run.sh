#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

export TRAILER_WEB_PORT="${TRAILER_WEB_PORT:-5274}"
export TRAILER_GAME_PORT="${TRAILER_GAME_PORT:-2667}"
export TRAILER_PLANNER_PORT="${TRAILER_PLANNER_PORT:-5275}"
export TRAILER_FAKE_API="${TRAILER_FAKE_API:-http://127.0.0.1:8865}"
export TRAILER_TOKEN_SECRET="${TRAILER_TOKEN_SECRET:-trailer-secret}"
export TRAILER_DISPLAY="${TRAILER_DISPLAY:-:97}"
export TRAILER_PHONE_DISPLAY="${TRAILER_PHONE_DISPLAY:-:96}"
export TRAILER_PHONE_LAND_DISPLAY="${TRAILER_PHONE_LAND_DISPLAY:-:95}"
# The footer's "Up to date" check compares the running bundle with the (faked) /version.json: both use this.
export VITE_GIT_SHA="${VITE_GIT_SHA:-$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo abcdef0)}"

started=()
cleanup() {
  # Each server was started in its own process group (setsid), so npx and the node it spawned both go.
  for pid in "${started[@]:-}"; do [ -n "$pid" ] && { kill -TERM -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; }; done
}
trap cleanup EXIT

up() { curl -fsS -o /dev/null "$1" 2>/dev/null; }
wait_for() {
  for _ in $(seq 1 90); do up "$1" && return 0; sleep 1; done
  echo "timed out waiting for $2 ($1)" >&2; exit 1
}

if [ ! -d "$REPO/node_modules" ]; then (cd "$REPO" && npm ci); fi
if [ ! -d "$REPO/duel-web/node_modules" ]; then (cd "$REPO/duel-web" && npm ci); fi
if [ ! -d "$HERE/node_modules" ]; then (cd "$HERE" && npm install --no-audit --no-fund); fi

start_xvfb() {
  local n="${1#:}"
  if [ ! -S "/tmp/.X11-unix/X$n" ]; then
    Xvfb "$1" -screen 0 "$2" -nolisten tcp -ac >/tmp/trailer-xvfb-$n.log 2>&1 &
    started+=("$!")
    sleep 1
  fi
}
start_xvfb "$TRAILER_DISPLAY" 1920x1080x24
start_xvfb "$TRAILER_PHONE_DISPLAY" 1000x1700x24
start_xvfb "$TRAILER_PHONE_LAND_DISPLAY" 1700x1000x24

GAME="http://127.0.0.1:$TRAILER_GAME_PORT"
WEB="http://127.0.0.1:$TRAILER_WEB_PORT"
if ! up "$GAME/health"; then
  cd "$REPO/game-server"
  GAME_TOKEN_SECRET="$TRAILER_TOKEN_SECRET" PORT="$TRAILER_GAME_PORT" LOG_LEVEL=error \
    CORS_ORIGINS="$WEB,http://localhost:$TRAILER_WEB_PORT" setsid npx tsx src/index.ts >/tmp/trailer-game.log 2>&1 &
  started+=("$!")
  cd "$HERE"
fi
if ! up "$WEB"; then
  cd "$REPO/duel-web"
  VITE_API_URL="$TRAILER_FAKE_API" VITE_GAME_SERVER_URL="$GAME" \
    setsid npx vite --port "$TRAILER_WEB_PORT" --strictPort --host 127.0.0.1 >/tmp/trailer-vite.log 2>&1 &
  started+=("$!")
  cd "$HERE"
fi
PLANNER="http://127.0.0.1:$TRAILER_PLANNER_PORT"
if ! up "$PLANNER"; then
  if [ ! -d "$REPO/frontend/node_modules" ]; then (cd "$REPO/frontend" && npm ci); fi
  cd "$REPO/frontend"
  VITE_API_URL="$TRAILER_FAKE_API" VITE_DUEL_URL="$WEB" \
    setsid npx vite --port "$TRAILER_PLANNER_PORT" --strictPort --host 127.0.0.1 >/tmp/trailer-planner.log 2>&1 &
  started+=("$!")
  cd "$HERE"
fi
wait_for "$GAME/health" "the game server"
wait_for "$WEB" "Vite"
wait_for "$PLANNER" "the planner Vite"

cd "$HERE"
npx tsx "${TRAILER_MAIN:-main.ts}" "$@"

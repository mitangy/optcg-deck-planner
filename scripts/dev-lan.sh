#!/usr/bin/env bash
# Run both dev servers reachable from a phone on the same Wi-Fi, without
# hardcoding a LAN IP anywhere: it's detected fresh on every run and passed
# to the backend as a real environment variable, which pydantic-settings
# treats as higher priority than the checked-in .env file — so backend/.env
# stays untouched at its localhost default for the normal (non-phone)
# workflow. Only the backend needs this: it's for the CORS allowlist, and
# the frontend derives its own API target from whatever host the page was
# loaded from (see api.ts), so localhost and the LAN IP both work at once
# without either one needing to be told about the other.
#
# Usage:
#   scripts/dev-lan.sh          # auto-detect LAN IP
#   scripts/dev-lan.sh 10.0.0.5 # override if auto-detect picks the wrong NIC
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

detect_ip() {
  # macOS: try common interface names in order (Wi-Fi is usually en0, but
  # docks/dongles can shift this — fall back through a short list).
  for iface in en0 en1 en2; do
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    [ -n "$ip" ] && { echo "$ip"; return; }
  done
  # Linux fallback.
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -n "$ip" ] && { echo "$ip"; return; }
  return 1
}

IP="${1:-$(detect_ip || true)}"
if [ -z "${IP:-}" ]; then
  echo "Couldn't auto-detect a LAN IP. Find it yourself (System Settings >" >&2
  echo "Wi-Fi > Details on macOS) and pass it explicitly:" >&2
  echo "  $0 <your-lan-ip>" >&2
  exit 1
fi

echo "LAN IP: $IP"
echo "On your phone (same Wi-Fi): http://$IP:5173"
echo

pids=()
cleanup() {
  echo
  echo "Stopping…"
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

(
  cd backend
  FRONTEND_ORIGIN="http://$IP:5173" \
  BACKEND_PUBLIC_URL="http://$IP:8000" \
    .venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) &
pids+=("$!")

(
  # No VITE_API_URL override: api.ts derives the API host from whatever host
  # the page was loaded from, so this stays correct whether you open it via
  # localhost (desktop) or this LAN IP (phone) — including both at once.
  cd frontend
  npm run dev -- --host
) &
pids+=("$!")

wait

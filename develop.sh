#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Non-interactive shells can miss the system directories containing ipconfig
# and route, so include them while detecting a reachable LAN address.
export PATH="$PATH:/usr/sbin:/sbin"

PORT="${DEV_PORT:-5173}"

# A dev server left running from an earlier session is the usual reason this
# port is taken. Say which process it is rather than letting Vite fail later.
if command -v lsof >/dev/null 2>&1; then
  HOLDER="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -n1 || true)"
  if [ -n "$HOLDER" ]; then
    echo "!! Port $PORT is already in use by process $HOLDER:" >&2
    ps -p "$HOLDER" -o pid=,lstart=,command= >&2 || true
    echo "   Stop it with: kill $HOLDER    (or run: DEV_PORT=5174 ./develop.sh)" >&2
    exit 1
  fi
fi

lan_ip() {
  local ip iface
  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1 en2; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [ -n "$ip" ] && { echo "$ip"; return; }
    done
  fi
  if command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
    [ -n "$ip" ] && { echo "$ip"; return; }
  fi
  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

IP="$(lan_ip)"
if [ -z "$IP" ]; then
  echo "!! Could not detect a LAN IP — other devices may not reach the dev server." >&2
  IP="localhost"
fi
URL="http://$IP:$PORT"

# Which timer website the phone embeds. Development means the ../timer dev
# server on this machine: the deployed timer.gcc3.com only gains the glasses
# sync once the changed ../timer is deployed, so embedding it here shows
# `--:--` on the glasses and a tap does nothing. A phone on the LAN cannot
# reach `localhost`, so the address is rewritten to this machine's LAN IP.
# Set VITE_TIMER_URL (or put it in .env) to embed something else.
TIMER_PORT="${TIMER_PORT:-3300}"
if [ -z "${VITE_TIMER_URL:-}" ] && [ -f .env ]; then
  VITE_TIMER_URL="$(grep -m1 '^VITE_TIMER_URL=' .env | cut -d= -f2- || true)"
fi
VITE_TIMER_URL="${VITE_TIMER_URL:-http://localhost:$TIMER_PORT/}"
case "$VITE_TIMER_URL" in
  http://localhost:*|http://127.0.0.1:*)
    VITE_TIMER_URL="${VITE_TIMER_URL/localhost/$IP}"
    VITE_TIMER_URL="${VITE_TIMER_URL/127.0.0.1/$IP}"
    ;;
esac
export VITE_TIMER_URL
echo "==> Timer website the phone will embed: $VITE_TIMER_URL"
case "$VITE_TIMER_URL" in
  http://$IP:*)
    if command -v lsof >/dev/null 2>&1 && [ -z "$(lsof -nP -iTCP:"$TIMER_PORT" -sTCP:LISTEN -t 2>/dev/null)" ]; then
      echo "!! Nothing is listening on port $TIMER_PORT. Start the timer first: cd ../timer && pnpm dev" >&2
    fi
    ;;
  https://timer.gcc3.com/*)
    echo "    (the deployed site: the glasses only sync once the changed ../timer is deployed there)"
    ;;
esac

if command -v evenhub >/dev/null 2>&1; then
  evenhub qr --url "$URL" || echo "!! evenhub qr failed — continuing without a QR code." >&2
else
  echo "==> evenhub not found on PATH; skipping QR code."
  echo "    App URL: $URL"
  echo "    Install per https://hub.evenrealities.com/docs/getting-started/overview"
fi

# `npm run dev` already binds 0.0.0.0.
npm run dev -- --port "$PORT" --strictPort --clearScreen false

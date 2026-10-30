#!/bin/bash

RUN_MODE="${1:-dev}"
TUNNEL_NAME="${2:-catdai}"
SERVICE_PIDS=()

cleanup() {
  trap - EXIT SIGINT SIGTERM
  echo -e "\n🛑 Stopping $RUN_MODE server, payment worker and tunnel..."
  if [ "${#SERVICE_PIDS[@]}" -gt 0 ]; then
    kill "${SERVICE_PIDS[@]}" 2>/dev/null
    wait "${SERVICE_PIDS[@]}" 2>/dev/null
  fi
  echo "✅ Done!"
}

trap cleanup EXIT
trap 'exit 130' SIGINT
trap 'exit 143' SIGTERM

if [ "$RUN_MODE" = "prod" ]; then
  export NODE_ENV=production
  echo "🏗️ Building for production..."
  pnpm exec next build || exit "$?"

  echo "🚀 Starting Next.js prod server on port 3000..."
  node node_modules/next/dist/bin/next start &
else
  export NODE_ENV=development
  echo "🚀 Starting Next.js dev server on port 3000..."
  node node_modules/next/dist/bin/next dev &
fi

NEXT_PID=$!
SERVICE_PIDS+=("$NEXT_PID")

echo "⏳ Waiting for Next.js to start on port 3000..."
for i in {1..10}; do
  if nc -z localhost 3000 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "✉️ Starting MAIB reconciliation and payment receipt delivery..."
node scripts/reconcile-maib.mjs &
SERVICE_PIDS+=("$!")

echo "☁️ Starting cloudflared tunnel '$TUNNEL_NAME' (ENV: $RUN_MODE)..."
cloudflared tunnel run "$TUNNEL_NAME" &
SERVICE_PIDS+=("$!")

# Bash 3 (macOS) has no wait -n. Stop the group if any service exits.
while true; do
  for pid in "${SERVICE_PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid"
      exit "$?"
    fi
  done
  sleep 1
done

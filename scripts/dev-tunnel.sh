#!/bin/bash

ENV="${1:-dev}"
TUNNEL_NAME="${2:-catdai}"

if [ "$ENV" = "prod" ]; then
  echo "🏗️ Building for production..."
  pnpm exec next build

  echo "🚀 Starting Next.js prod server on port 3000..."
  pnpm exec next start &
else
  echo "🚀 Starting Next.js dev server on port 3000..."
  pnpm exec next dev &
fi

NEXT_PID=$!

echo "⏳ Waiting for Next.js to start on port 3000..."
for i in {1..10}; do
  if nc -z localhost 3000 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "☁️ Starting cloudflared tunnel '$TUNNEL_NAME' (ENV: $ENV)..."
cloudflared tunnel run "$TUNNEL_NAME" &
CLOUDFLARED_PID=$!

cleanup() {
  echo -e "\n🛑 Stopping $ENV server and tunnel..."
  kill $NEXT_PID 2>/dev/null
  kill $CLOUDFLARED_PID 2>/dev/null
  wait $NEXT_PID 2>/dev/null
  wait $CLOUDFLARED_PID 2>/dev/null
  echo "✅ Done!"
  exit 0
}

trap cleanup SIGINT SIGTERM

wait $NEXT_PID $CLOUDFLARED_PID
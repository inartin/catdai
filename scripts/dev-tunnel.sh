#!/bin/bash

# Default tunnel name is 'catdai', but can be overridden by CLI argument
TUNNEL_NAME="${1:-catdai}"

echo "🚀 Starting Next.js dev server on port 3000..."
pnpm run dev &
NEXT_PID=$!

# Wait for port 3000 to be ready (up to 10 seconds)
echo "⏳ Waiting for Next.js to start on port 3000..."
for i in {1..10}; do
  if nc -z localhost 3000 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "☁️ Starting cloudflared tunnel '$TUNNEL_NAME'..."
cloudflared tunnel run "$TUNNEL_NAME" &
CLOUDFLARED_PID=$!

# Handle shutdown cleanly on Ctrl+C (SIGINT) or SIGTERM
cleanup() {
  echo -e "\n🛑 Stopping dev server and tunnel..."
  kill $NEXT_PID 2>/dev/null
  kill $CLOUDFLARED_PID 2>/dev/null
  wait $NEXT_PID 2>/dev/null
  wait $CLOUDFLARED_PID 2>/dev/null
  echo "✅ Done!"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for background processes to finish
wait $NEXT_PID $CLOUDFLARED_PID

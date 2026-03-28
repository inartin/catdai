import { NextResponse } from "next/server";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ── In-memory cache ─────────────────────────────────────────
let cache = null; // { data, updated_at }

function isCacheFresh(updatedAt) {
  if (!updatedAt) return false;
  return Date.now() - new Date(updatedAt).getTime() < TWENTY_FOUR_HOURS_MS;
}

async function fetchFromParser() {
  const token = process.env.CATDAI_API_TOKEN;
  const baseUrl = process.env.CATDAI_API_URL || "http://localhost:3100";

  const res = await fetch(`${baseUrl}/api/prices/latest`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Parser API responded ${res.status}`);
  }

  return res.json();
}

export async function GET() {
  // 1. Return cached data if updated_at is < 24h old
  if (cache && isCacheFresh(cache.updated_at)) {
    return NextResponse.json(cache.data);
  }

  // 2. Fetch fresh data from parser API
  try {
    const data = await fetchFromParser();
    cache = { data, updated_at: data.updated_at };
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to fetch prices from parser:", err.message);

    // 3. Return stale cache if available
    if (cache) {
      return NextResponse.json(cache.data);
    }

    return NextResponse.json(
      { error: "Price data unavailable" },
      { status: 502 }
    );
  }
}

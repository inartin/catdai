import { NextResponse } from "next/server";
import { getSharedCache, setSharedCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60;
const CACHE_KEY = "catdai:prices:latest:v1";
const LAST_KNOWN_KEY = "catdai:prices:last-known:v1";
// 30 days – effectively "permanent"; refreshed on every successful fetch
const LAST_KNOWN_TTL_SECONDS = 30 * 24 * 60 * 60;

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
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Parser API responded ${res.status}`);
  }

  return res.json();
}

export async function GET() {
  const sharedCache = await getSharedCache(CACHE_KEY);
  if (sharedCache && isCacheFresh(sharedCache.value?.updated_at)) {
    cache = { data: sharedCache.value, updated_at: sharedCache.value.updated_at };
    return NextResponse.json(sharedCache.value, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  // 1. Return cached data if updated_at is < 24h old
  if (cache && isCacheFresh(cache.updated_at)) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  // 2. Fetch fresh data from parser API
  try {
    const data = await fetchFromParser();
    cache = { data, updated_at: data.updated_at };
    await Promise.all([
      setSharedCache(CACHE_KEY, data, TWENTY_FOUR_HOURS_SECONDS),
      setSharedCache(LAST_KNOWN_KEY, data, LAST_KNOWN_TTL_SECONDS),
    ]);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("Failed to fetch prices from parser:", err.message);

    // 3. Return stale in-memory cache if available
    if (cache) {
      console.log("Serving stale in-memory price cache");
      return NextResponse.json(cache.data, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    // 4. Try stale Redis (normal key may still exist)
    const staleShared = await getSharedCache(CACHE_KEY);
    if (staleShared?.value) {
      console.log("Serving stale Redis price cache");
      cache = { data: staleShared.value, updated_at: staleShared.value.updated_at };
      return NextResponse.json(staleShared.value, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    // 5. Last resort: long-lived "last known good" Redis key
    const lastKnown = await getSharedCache(LAST_KNOWN_KEY);
    if (lastKnown?.value) {
      console.log("Serving last-known-good price cache");
      cache = { data: lastKnown.value, updated_at: lastKnown.value.updated_at };
      return NextResponse.json(lastKnown.value, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    return NextResponse.json(
      { error: "Price data unavailable" },
      { status: 502 }
    );
  }
}

import { getSharedCache, setSharedCache } from "@/lib/cache";

const CACHE_PREFIX = "catdai:listing-analyze:v2:";
const CACHE_TTL_SECONDS = 6 * 60 * 60;
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const MAX_ENTRIES = 500;

// ── In-memory fallback (used when Redis is unavailable) ─────
const store = new Map();

function cacheKey(id) {
  return `${CACHE_PREFIX}${id}`;
}

function getMemory(id) {
  const record = store.get(id);
  if (!record) return null;
  if (Date.now() - record.ts > CACHE_TTL_MS) {
    store.delete(id);
    return null;
  }
  store.delete(id);
  store.set(id, record);
  return record.value;
}

function setMemory(id, value) {
  if (store.has(id)) store.delete(id);
  else if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(id, { ts: Date.now(), value });
}

export async function getCachedListing(id) {
  const shared = await getSharedCache(cacheKey(id));
  if (shared) {
    setMemory(id, shared.value);
    return shared.value;
  }
  return getMemory(id);
}

export async function setCachedListing(id, value) {
  setMemory(id, value);
  await setSharedCache(cacheKey(id), value, CACHE_TTL_SECONDS);
}

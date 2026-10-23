import crypto from "node:crypto";
import { getSharedCache, setSharedCache } from "@/lib/cache";

export const CADASTRU_TTL_SECONDS = 90 * 24 * 60 * 60;
export const CADASTRU_BUILDING_TTL_SECONDS = 180 * 24 * 60 * 60;
export const CADASTRU_REGISTRY_TTL_SECONDS = 30 * 24 * 60 * 60;
export const CADASTRU_TRANSPORT_TTL_SECONDS = 30 * 24 * 60 * 60;
const CACHE_POLICY = 2;

export function cadastruExpiresAt(fetchedAt = new Date().toISOString(), ttlSeconds = CADASTRU_TTL_SECONDS) {
  return new Date(new Date(fetchedAt).getTime() + ttlSeconds * 1000).toISOString();
}

export function isFreshCadastru(expiresAt) {
  return Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > Date.now();
}

export function cadastruCacheKey(kind, value) {
  const normalized = kind === "number" ? String(value).replace(/\D/g, "") : value;
  return `catdai:cadastru:${kind}:v3:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

export function cleanCadastruPayload(payload) {
  const clean = { ...payload };
  for (const key of ["access_tier", "locked_sections", "access_limit", "building_bundles", "data_freshness"]) delete clean[key];
  return clean;
}

export async function readCadastruCache(kind, key, options = {}) {
  const cached = await getSharedCache(cadastruCacheKey(kind, key));
  return cached?.value?.cachePolicy === CACHE_POLICY && cached.value.payload
    && (options.allowExpired || isFreshCadastru(cached.value.expiresAt)) ? cached.value : null;
}

export async function writeCadastruCache(kind, key, entry) {
  if (!Number.isFinite(Date.parse(entry.expiresAt))) return;
  // Redis retention and source freshness are independent. Expired snapshots stay useful.
  const ttl = kind === "building" ? CADASTRU_BUILDING_TTL_SECONDS : CADASTRU_TTL_SECONDS;
  await setSharedCache(cadastruCacheKey(kind, key), {
    ...entry,
    cachePolicy: CACHE_POLICY,
    payload: cleanCadastruPayload(entry.payload),
  }, ttl);
}

export function cadastruFreshness(entry) {
  return { fetched_at: entry.fetchedAt || null, expires_at: entry.expiresAt,
    stale: !isFreshCadastru(entry.expiresAt) };
}

export function withCadastruFreshness(entry) {
  return { ...entry.payload, data_freshness: { ...entry.payload.data_freshness,
    property: cadastruFreshness(entry),
    ...(hasRegistryData(entry.payload) ? { registry: { fetched_at: entry.fetchedAt || null,
      expires_at: entry.fetchedAt ? cadastruExpiresAt(entry.fetchedAt, CADASTRU_REGISTRY_TTL_SECONDS) : null,
      stale: !entry.fetchedAt || !isFreshCadastru(cadastruExpiresAt(entry.fetchedAt, CADASTRU_REGISTRY_TTL_SECONDS)),
    } } : {}),
  } };
}

function hasRegistryData(payload) {
  const properties = [payload.apartment, ...(payload.lands || []), ...(payload.buildings || [])];
  return properties.some(property => property &&
    ["ownership_type", "transactions_count", "real_rights", "notes", "restrictions"]
      .some(key => property[key] !== null && property[key] !== undefined && property[key] !== ""));
}

export function cadastruNeedsRefresh(entry) {
  return Object.values(withCadastruFreshness(entry).data_freshness).some(section => section?.stale);
}

export async function invalidateCadastruCache(kind, key) {
  await setSharedCache(cadastruCacheKey(kind, key), null, 1);
}

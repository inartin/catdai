import crypto from "node:crypto";
import { getSharedCache, setSharedCache } from "@/lib/cache";

export const CADASTRU_TTL_SECONDS = 30 * 24 * 60 * 60;

export function cadastruExpiresAt(fetchedAt = new Date().toISOString()) {
  return new Date(new Date(fetchedAt).getTime() + CADASTRU_TTL_SECONDS * 1000).toISOString();
}

export function isFreshCadastru(expiresAt) {
  return Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > Date.now();
}

export function cadastruCacheKey(kind, value) {
  const normalized = kind === "number" ? String(value).replace(/\D/g, "") : value;
  return `catdai:cadastru:${kind}:v2:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

export function cleanCadastruPayload(payload) {
  const clean = { ...payload };
  for (const key of ["access_tier", "locked_sections", "access_limit"]) delete clean[key];
  return clean;
}

export async function readCadastruCache(kind, key) {
  const cached = await getSharedCache(cadastruCacheKey(kind, key));
  return cached?.value?.payload && isFreshCadastru(cached.value.expiresAt) ? cached.value : null;
}

export async function writeCadastruCache(kind, key, entry) {
  const ttl = Math.min(CADASTRU_TTL_SECONDS, Math.floor((Date.parse(entry.expiresAt) - Date.now()) / 1000));
  if (!(ttl > 0)) return;
  await setSharedCache(cadastruCacheKey(kind, key), {
    ...entry,
    payload: cleanCadastruPayload(entry.payload),
  }, ttl);
}

import crypto from "node:crypto";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { CADASTRU_TTL_SECONDS, cadastruExpiresAt, isFreshCadastru } from "@/lib/cadastru-cache";

export function cadastruLocationOriginKey(input) {
  // Key the resolved building/address or coordinates, so apartments share routes.
  const normalized = Object.fromEntries(Object.keys(input).sort().map((key) => [key,
    typeof input[key] === "string" ? input[key].normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim() : input[key],
  ]));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function createCadastruLocationStore({ name, table, isValid }) {
  function cacheKey(originKey) {
    return `catdai:cadastru:${name}:v1:${originKey}`;
  }

  function validEntry(entry) {
    return isValid(entry?.payload) && !entry.payload.incomplete
      && Number.isFinite(Date.parse(entry.fetchedAt)) && Number.isFinite(Date.parse(entry.expiresAt));
  }

  async function cacheEntry(originKey, entry) {
    const ttl = Math.min(CADASTRU_TTL_SECONDS, Math.floor((Date.parse(entry.expiresAt) - Date.now()) / 1000));
    if (ttl > 0) await setSharedCache(cacheKey(originKey), entry, ttl);
  }

  async function get(input) {
    const originKey = cadastruLocationOriginKey(input);
    const cached = await getSharedCache(cacheKey(originKey));
    if (validEntry(cached?.value) && isFreshCadastru(cached.value.expiresAt)) return cached.value;
    if (!shouldPersistRuntimeData()) return null;
    try {
      const { data, error } = await supabaseAdmin.from(table)
        .select("raw_payload, fetched_at, expires_at").eq("origin_key", originKey).limit(1);
      if (error) throw error;
      const row = data?.[0];
      const entry = row && { payload: row.raw_payload, fetchedAt: row.fetched_at, expiresAt: row.expires_at };
      if (!validEntry(entry)) return null;
      // Keep expired DB rows available for fallback, without renewing their deadline.
      await cacheEntry(originKey, entry);
      return entry;
    } catch (error) {
      console.error(`[cadastru-${name}] stored lookup failed:`, error.message);
      return null;
    }
  }

  async function store(input, payload, timestamps = {}) {
    if (!isValid(payload) || payload.incomplete) return null;
    const originKey = cadastruLocationOriginKey(input);
    const fetchedAt = timestamps.fetchedAt || new Date().toISOString();
    const entry = { payload, fetchedAt, expiresAt: timestamps.expiresAt || cadastruExpiresAt(fetchedAt) };
    if (!validEntry(entry)) return null;
    if (shouldPersistRuntimeData()) {
      try {
        const { error } = await supabaseAdmin.from(table).upsert({
          origin_key: originKey,
          lookup_input: input,
          raw_payload: payload,
          fetched_at: fetchedAt,
          expires_at: entry.expiresAt,
        }, { onConflict: "origin_key" });
        if (error) throw error;
      } catch (error) {
        console.error(`[cadastru-${name}] save failed:`, error.message);
        // Do not hide a failed durable write behind a month-long Redis hit.
        // The next request can retry saving; the current successful response still displays.
        return entry;
      }
    }
    await cacheEntry(originKey, entry);
    return entry;
  }

  function toResponse(entry) {
    return { ...entry.payload, cache: {
      fetched_at: entry.fetchedAt, expires_at: entry.expiresAt, stale: !isFreshCadastru(entry.expiresAt),
    } };
  }

  return { get, store, toResponse };
}

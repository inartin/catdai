import crypto from "node:crypto";
import { after } from "next/server";
import { getSharedCacheClient } from "@/lib/cache";

const RETRY_SECONDS = 5 * 60;
const pending = new Map();

export function isUsableCadastruRefresh(previous, next) {
  if (!next || typeof next !== "object" || next.incomplete || next.registry_unavailable || next.cache?.stale) return false;
  const digits = value => String(value || "").replace(/\D/g, "");
  if (previous.cadastral_number && digits(next.cadastral_number) !== digits(previous.cadastral_number)) return false;
  const retains = (old, fresh) => !old || Object.entries(old).every(([key, value]) =>
    key === "partial" || value === null || value === undefined || value === "" || (fresh?.[key] !== null && fresh?.[key] !== undefined && fresh?.[key] !== ""));
  if (!["apartment", "building"].every(key => retains(previous[key], next[key]))) return false;
  return ["lands", "buildings"].every(key => !previous[key]?.length || previous[key].every(property =>
    next[key]?.some(candidate => digits(candidate.cadastral_number) === digits(property.cadastral_number) && retains(property, candidate))));
}

// Run after sending the saved result. Redis coordinates processes; the local
// cooldown also prevents repeated failed refreshes when Redis is unavailable.
export function scheduleCadastruRefresh(identity, refresh) {
  const now = Date.now();
  for (const [key, expires] of pending) if (expires <= now) pending.delete(key);
  const key = `catdai:cadastru:refresh:v1:${crypto.createHash("sha256").update(identity).digest("hex")}`;
  if (pending.has(key)) return;
  pending.set(key, now + RETRY_SECONDS * 1000);
  after(async () => {
    try {
      const client = await getSharedCacheClient();
      if (client && !await client.set(key, "1", { NX: true, EX: RETRY_SECONDS })) return;
      await refresh();
    } catch (error) {
      console.error("[cadastru-refresh] refresh failed:", error?.message || String(error));
    }
  });
}

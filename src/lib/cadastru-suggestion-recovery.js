import crypto from "node:crypto";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function signingKey() {
  return process.env.CADASTRU_EXTERNAL_API_SECRET || "";
}

function signature(value) {
  return crypto.createHmac("sha256", signingKey()).update("cadastru-suggestion-recovery:v1\n").update(value).digest("base64url");
}

export function createSuggestionRecoveryToken(eventId, address, suggestions) {
  if (!eventId || !suggestions.length || !signingKey()) return null;
  const value = Buffer.from(JSON.stringify({ eventId, address, suggestions, expires: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${value}.${signature(value)}`;
}

export function readSuggestionRecoveryToken(token, address) {
  if (typeof token !== "string" || token.length > 4000 || !signingKey()) return null;
  try {
    const [value, supplied, extra] = token.split(".");
    if (!value || !supplied || extra) return null;
    const expected = Buffer.from(signature(value));
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    if (!data.eventId || data.expires < Date.now() || !Array.isArray(data.suggestions)) return null;
    const confirmedAddress = data.suggestions.some((suggestion) => suggestion && typeof suggestion === "object" &&
      ["city", "roadType", "street", "houseNumber", "apartmentNumber"].every((key) => suggestion[key] === address[key]));
    if (!confirmedAddress) {
      if (!data.suggestions.includes(address.street)) return null;
      for (const key of ["city", "roadType", "houseNumber", "apartmentNumber"]) {
        if (data.address?.[key] !== address[key]) return null;
      }
    }
    return data;
  } catch {
    return null;
  }
}

export async function recordSuggestionRecovery(recovery, { address, lookupSource }) {
  if (!recovery || process.env.NODE_ENV === "development" || !shouldPersistRuntimeData()) return;
  try {
    const { error } = await supabaseAdmin.from("external_api_usage_events")
      .update({ suggestion_recovery: {
        recovered_at: new Date().toISOString(),
        suggested_street: address.street,
        resolved_address: address.resolvedAddress,
        lookup_source: lookupSource,
      } })
      .eq("id", recovery.eventId)
      .eq("service", "cadastru_address")
      .eq("status", "failure")
      .is("suggestion_recovery", null);
    if (error && !["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error.code))) {
      console.error("[cadastru-suggestion-recovery] update failed:", error.message);
    }
  } catch (error) {
    console.error("[cadastru-suggestion-recovery] update failed:", error?.message || String(error));
  }
}

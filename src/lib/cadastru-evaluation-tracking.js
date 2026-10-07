import crypto from "node:crypto";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingKey() {
  return process.env.CADASTRU_EXTERNAL_API_SECRET || process.env.ADMIN_TOKEN || "";
}

function signature(value) {
  return crypto.createHmac("sha256", signingKey()).update("cadastru-evaluation:v1\n").update(value).digest("base64url");
}

export function createCadastruEvaluationToken(eventId) {
  if (!Number.isSafeInteger(Number(eventId)) || !signingKey()) return null;
  const value = Buffer.from(JSON.stringify({ eventId: Number(eventId), expires: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${value}.${signature(value)}`;
}

export function readCadastruEvaluationToken(token) {
  if (typeof token !== "string" || token.length > 500 || !signingKey()) return null;
  try {
    const [value, supplied, extra] = token.split(".");
    if (!value || !supplied || extra) return null;
    const expected = Buffer.from(signature(value));
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    if (!Number.isSafeInteger(data.eventId) || data.eventId <= 0 || !Number.isFinite(data.expires) || data.expires < Date.now()) return null;
    return data.eventId;
  } catch {
    return null;
  }
}

export async function recordCadastruEvaluationStep(token, step) {
  const eventId = readCadastruEvaluationToken(token);
  if (!eventId || !shouldPersistRuntimeData() || process.env.NODE_ENV === "development") return false;
  const column = step === "click" ? "valuation_clicked_at" : step === "complete" ? "valuation_completed_at" : null;
  if (!column) return false;

  try {
    let query = supabaseAdmin.from("cadastru_search_events")
      .update({ [column]: new Date().toISOString() })
      .eq("id", eventId)
      .is(column, null);
    if (step === "complete") query = query.not("valuation_clicked_at", "is", null);
    const { data, error } = await query.select("id");
    if (error) throw error;
    return Boolean(data?.length);
  } catch (error) {
    console.error(`[cadastru-evaluation] ${step} failed:`, error?.message || String(error));
    return false;
  }
}

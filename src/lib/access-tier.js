import { supabaseAdmin } from "@/lib/supabase-admin";

const PAID_TIERS = new Set(["paid", "premium", "pro", "business"]);

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return false;
  return ts <= Date.now();
}

export function isPaidAccessTier(tier) {
  return String(tier || "").toLowerCase() === "paid";
}

export async function resolveAccessTier(request) {
  const token = getBearerToken(request);
  if (!token) return { tier: "paid", user_id: null };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return { tier: "paid", user_id: null };
  }

  return { tier: "paid", user_id: authData.user.id };
}

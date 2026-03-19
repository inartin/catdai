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
  if (!token) return { tier: "free", user_id: null };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return { tier: "free", user_id: null };
  }

  const userId = authData.user.id;

  const { data: entitlement, error: entitlementError } = await supabaseAdmin
    .from("user_entitlements")
    .select("tier, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (entitlementError) {
    // If the table is not deployed yet, fail safely to free tier.
    if (entitlementError.code !== "42P01") {
      console.error("[access-tier] entitlement lookup failed:", entitlementError.message);
    }
    return { tier: "free", user_id: userId };
  }

  const tier = String(entitlement?.tier || "").toLowerCase();
  const paid = PAID_TIERS.has(tier) && !isExpired(entitlement?.expires_at);

  return { tier: paid ? "paid" : "free", user_id: userId };
}

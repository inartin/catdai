import { supabaseAdmin } from "@/lib/supabase-admin";

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

export function getRequestBearerToken(request) {
  return getBearerToken(request);
}

export function isPaidAccessTier(tier) {
  return String(tier || "").toLowerCase() === "paid";
}

export async function resolveAccessTierFromToken(token) {
  if (!token) return { tier: "free", user_id: null };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return { tier: "free", user_id: null };
  }

  return { tier: "free", user_id: authData.user.id };
}

export async function resolveAccessTier(request) {
  return resolveAccessTierFromToken(getBearerToken(request));
}

import { supabaseAdmin } from "@/lib/supabase-admin";

const requestUsers = new WeakMap();

export function getRequestUser(request) {
  if (!requestUsers.has(request)) {
    const token = getBearerToken(request);
    requestUsers.set(request, token
      ? supabaseAdmin.auth.getUser(token)
      : Promise.resolve({ data: { user: null }, error: null }));
  }
  return requestUsers.get(request);
}

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

  return { tier: "free", user_id: authData.user.id, ...(authData.user.is_anonymous ? { is_guest: true } : {}) };
}

export async function resolveAccessTier(request) {
  const { data, error } = await getRequestUser(request);
  return { tier: "free", user_id: error ? null : data?.user?.id || null, ...(!error && data?.user?.is_anonymous ? { is_guest: true } : {}) };
}

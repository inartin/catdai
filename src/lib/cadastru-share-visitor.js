import crypto from "node:crypto";

export const CADASTRU_SHARE_VISITOR_COOKIE = "catdai-cadastru-share-visitor";
export const CADASTRU_SHARE_VISITOR_MAX_AGE = 365 * 24 * 60 * 60;

function sign(value) {
  const secret = process.env.SUPABASE_SERVICE_KEY || process.env.ADMIN_TOKEN;
  if (!secret) throw new Error("Cadastru visitor cookie signing is not configured.");
  return crypto.createHmac("sha256", secret).update(`catdai:cadastru-share:${value}`).digest("base64url");
}

export function createCadastruShareVisitorCookie() {
  const value = `${crypto.randomUUID()}.${Math.floor(Date.now() / 1000) + CADASTRU_SHARE_VISITOR_MAX_AGE}`;
  return `${value}.${sign(value)}`;
}

export function readCadastruShareVisitorCookie(token) {
  if (typeof token !== "string" || token.length > 200) return null;
  const [id, expires, supplied, extra] = token.split(".");
  if (extra || !/^[0-9a-f-]{36}$/i.test(id) || !/^\d{10}$/.test(expires)
    || Number(expires) <= Date.now() / 1000 || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return null;
  const expected = Buffer.from(sign(`${id}.${expires}`));
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected) ? id : null;
}

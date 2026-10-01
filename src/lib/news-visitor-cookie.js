import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const NEWS_VISITOR_COOKIE = "catdai-news-visitor";
export const NEWS_VISITOR_MAX_AGE = 365 * 24 * 60 * 60;

function sign(payload) {
  const secret = process.env.NEWS_VIEW_COOKIE_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!secret) throw new Error("News visitor cookie signing is not configured.");
  return createHmac("sha256", secret).update(`catdai:news-visitor:${payload}`).digest("base64url");
}

export function createNewsVisitorCookie(visitorId = randomUUID()) {
  const expires = Math.floor(Date.now() / 1000) + NEWS_VISITOR_MAX_AGE;
  const payload = `v1.${visitorId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function readNewsVisitorCookie(token) {
  if (typeof token !== "string" || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, visitorId, expires, signature] = parts;
  if (version !== "v1" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(visitorId)) return null;
  if (!/^\d{10}$/.test(expires) || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;

  const expected = Buffer.from(sign(parts.slice(0, 3).join(".")));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? visitorId : null;
}

import crypto from "node:crypto";
import { NextResponse } from "next/server";

const SESSION_VERSION = "v1";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function signSessionPayload(payload) {
  if (!process.env.ADMIN_TOKEN) return null;

  return crypto
    .createHmac("sha256", process.env.ADMIN_TOKEN)
    .update(`${SESSION_VERSION}.${payload}`)
    .digest("base64url");
}

export function createAdminSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
    iat: now,
    nonce: crypto.randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const signature = signSessionPayload(payload);

  if (!signature) return null;

  return `${SESSION_VERSION}.${payload}.${signature}`;
}

export function verifyAdminSessionToken(token) {
  if (!token) return false;

  const [version, payload, signature] = token.split(".");
  if (version !== SESSION_VERSION || !payload || !signature) return false;

  const expectedSignature = signSessionPayload(payload);
  if (!tokenMatches(signature, expectedSignature)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function requireAdminApiAuth(request) {
  const token = request.cookies.get("admin_token")?.value;

  if (verifyAdminSessionToken(token)) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

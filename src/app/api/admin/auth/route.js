import { ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSessionToken } from "@/lib/admin-auth";
import { getSharedCacheClient } from "@/lib/cache";
import { NextResponse } from "next/server";

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_WINDOW_SECONDS = LOGIN_RATE_WINDOW_MS / 1000;
const LOGIN_RATE_PREFIX = "catdai:admin-login:v1:";
const loginAttempts = new Map();

function getClientIp(request) {
  if (process.env.ADMIN_TRUST_CF_CONNECTING_IP === "true") {
    return request.headers.get("cf-connecting-ip")?.trim() || request.ip || "unknown";
  }

  return request.ip || "unknown";
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function getAttemptKey(ip) {
  return `${LOGIN_RATE_PREFIX}${ip}`;
}

function getLocalAttemptRecord(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.start > LOGIN_RATE_WINDOW_MS) {
    const nextRecord = { start: now, count: 0 };
    loginAttempts.set(ip, nextRecord);
    return nextRecord;
  }

  return record;
}

function getLocalRetryAfter(record) {
  return Math.max(1, Math.ceil((record.start + LOGIN_RATE_WINDOW_MS - Date.now()) / 1000));
}

async function getRedisAttemptState(ip) {
  const client = await getSharedCacheClient();
  if (!client) {
    if (isProduction()) throw new Error("Redis is required for admin login rate limiting");
    return null;
  }

  const key = getAttemptKey(ip);
  const [rawCount, ttl] = await Promise.all([client.get(key), client.ttl(key)]);
  return {
    client,
    key,
    count: Number.parseInt(rawCount || "0", 10) || 0,
    retryAfter: ttl > 0 ? ttl : LOGIN_RATE_WINDOW_SECONDS,
  };
}

async function isLoginBlocked(ip) {
  const redisState = await getRedisAttemptState(ip);
  if (redisState) {
    if (redisState.count < LOGIN_RATE_LIMIT) return null;
    return redisState.retryAfter;
  }

  const record = getLocalAttemptRecord(ip);
  if (record.count < LOGIN_RATE_LIMIT) return null;
  return getLocalRetryAfter(record);
}

async function recordFailedLogin(ip) {
  const redisState = await getRedisAttemptState(ip);
  if (redisState) {
    const count = await redisState.client.incr(redisState.key);
    if (count === 1) {
      await redisState.client.expire(redisState.key, LOGIN_RATE_WINDOW_SECONDS);
      return null;
    }

    const ttl = await redisState.client.ttl(redisState.key);
    if (ttl < 0) await redisState.client.expire(redisState.key, LOGIN_RATE_WINDOW_SECONDS);
    if (count < LOGIN_RATE_LIMIT) return null;
    return ttl > 0 ? ttl : LOGIN_RATE_WINDOW_SECONDS;
  }

  const record = getLocalAttemptRecord(ip);
  record.count += 1;
  if (record.count < LOGIN_RATE_LIMIT) return null;
  return getLocalRetryAfter(record);
}

async function clearFailedLogins(ip) {
  const client = await getSharedCacheClient();
  if (client) {
    await client.del(getAttemptKey(ip));
    return;
  }

  loginAttempts.delete(ip);
}

function rateLimitUnavailableResponse(error) {
  console.error("[admin/auth] rate limit unavailable:", error.message);
  return NextResponse.json(
    { error: "Admin login is temporarily unavailable." },
    { status: 503 }
  );
}

export async function POST(request) {
  const ip = getClientIp(request);
  let retryAfter;

  try {
    retryAfter = await isLoginBlocked(ip);
  } catch (error) {
    return rateLimitUnavailableResponse(error);
  }

  if (retryAfter) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || key !== process.env.ADMIN_LOGIN_KEY) {
    try {
      await recordFailedLogin(ip);
    } catch (error) {
      return rateLimitUnavailableResponse(error);
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { password } = body;

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    try {
      await recordFailedLogin(ip);
    } catch (error) {
      return rateLimitUnavailableResponse(error);
    }
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const useSecure = request.headers.get("x-forwarded-proto") === "https";
  const sessionToken = createAdminSessionToken();

  if (!sessionToken) {
    return NextResponse.json({ error: "Admin session is not configured" }, { status: 500 });
  }

  await clearFailedLogins(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", sessionToken, {
    httpOnly: true,
    secure: useSecure,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  return res;
}

export async function DELETE(request) {
  const useSecure = request.headers.get("x-forwarded-proto") === "https";

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: useSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

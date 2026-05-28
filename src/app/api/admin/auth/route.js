import { ADMIN_SESSION_MAX_AGE_SECONDS, createAdminSessionToken } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function getAttemptRecord(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.start > LOGIN_RATE_WINDOW_MS) {
    const nextRecord = { start: now, count: 0 };
    loginAttempts.set(ip, nextRecord);
    return nextRecord;
  }

  return record;
}

function getRetryAfter(record) {
  return Math.max(1, Math.ceil((record.start + LOGIN_RATE_WINDOW_MS - Date.now()) / 1000));
}

function isLoginBlocked(ip) {
  const record = getAttemptRecord(ip);
  if (record.count < LOGIN_RATE_LIMIT) return null;
  return getRetryAfter(record);
}

function recordFailedLogin(ip) {
  const record = getAttemptRecord(ip);
  record.count += 1;
  if (record.count < LOGIN_RATE_LIMIT) return null;
  return getRetryAfter(record);
}

export async function POST(request) {
  const ip = getClientIp(request);
  const retryAfter = isLoginBlocked(ip);

  if (retryAfter) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || key !== process.env.ADMIN_LOGIN_KEY) {
    recordFailedLogin(ip);
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
    recordFailedLogin(ip);
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const useSecure = request.headers.get("x-forwarded-proto") === "https";
  const sessionToken = createAdminSessionToken();

  if (!sessionToken) {
    return NextResponse.json({ error: "Admin session is not configured" }, { status: 500 });
  }

  loginAttempts.delete(ip);

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

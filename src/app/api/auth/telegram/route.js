import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 20 });
const TELEGRAM_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
let jwksCache = null;
let jwksCacheExpiresAt = 0;
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function decodeJwtPart(value) {
  try {
    const payload = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  return decodeJwtPart(parts[1]);
}

async function getTelegramJwks() {
  if (jwksCache && Date.now() < jwksCacheExpiresAt) return jwksCache;

  const response = await fetch(TELEGRAM_JWKS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to fetch Telegram keys.");

  const jwks = await response.json();
  jwksCache = Array.isArray(jwks.keys) ? jwks.keys : [];
  jwksCacheExpiresAt = Date.now() + 60 * 60 * 1000;
  return jwksCache;
}

function getVerifyAlgorithm(alg) {
  if (alg === "RS256") return "RSA-SHA256";
  if (alg === "ES256" || alg === "ES256K") return "SHA256";
  if (alg === "EdDSA") return null;
  return undefined;
}

async function verifyJwtSignature(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return false;

  const header = decodeJwtPart(parts[0]);
  if (!header?.kid || !header?.alg) return false;

  const keys = await getTelegramJwks();
  const key = keys.find((item) => item.kid === header.kid && item.alg === header.alg);
  if (!key) return false;

  const publicKey = crypto.createPublicKey({ key, format: "jwk" });
  const signature = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const input = Buffer.from(`${parts[0]}.${parts[1]}`);

  try {
    if (header.alg === "EdDSA") {
      return crypto.verify(null, input, publicKey, signature);
    }

    const algorithm = getVerifyAlgorithm(header.alg);
    return algorithm ? crypto.verify(algorithm, input, publicKey, signature) : false;
  } catch {
    return false;
  }
}

function verifyTelegramPayload(payload) {
  const clientId = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID;
  const now = Math.floor(Date.now() / 1000);

  if (!clientId) return { error: "Telegram client id is missing." };
  if (!payload || typeof payload !== "object") return { error: "Telegram token is invalid." };
  if (payload.iss !== "https://oauth.telegram.org") return { error: "Telegram token issuer is invalid." };
  if (payload.aud !== clientId && !(Array.isArray(payload.aud) && payload.aud.includes(clientId))) {
    return { error: "Telegram token audience is invalid." };
  }
  if (!payload.sub || !/^\d+$/.test(String(payload.sub))) return { error: "Telegram user id is missing." };
  if (!Number.isFinite(payload.exp) || payload.exp < now) return { error: "Telegram token expired." };

  return { telegramUser: payload };
}

function buildTelegramEmail(telegramId) {
  return `telegram-${telegramId}@auth.catdai.md`;
}

async function createPassword(telegramId) {
  const secret = process.env.TELEGRAM_LOGIN_SECRET || process.env.TELEGRAM_LINK_SECRET;
  if (!secret) throw new Error("Telegram login secret is missing.");
  return crypto.createHmac("sha256", secret).update(`catdai:${telegramId}`).digest("hex");
}

async function ensureTelegramUser(telegramUser) {
  const telegramId = String(telegramUser.sub);
  const email = buildTelegramEmail(telegramId);
  const password = await createPassword(telegramId);
  const userMetadata = {
    provider: "telegram",
    telegram_id: telegramId,
    name: telegramUser.name || telegramUser.preferred_username || `Telegram ${telegramId}`,
    user_name: telegramUser.preferred_username || null,
    avatar_url: telegramUser.picture || null,
    picture: telegramUser.picture || null,
  };

  let existingUser = null;
  for (let page = 1; page <= 20 && !existingUser; page += 1) {
    const { data: existing, error: lookupError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (lookupError) throw new Error("Failed to find Telegram user.");

    existingUser = existing?.users?.find((user) => user.email === email) || null;
    if (!existing?.users?.length || existing.users.length < 1000) break;
  }

  if (existingUser) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password,
      user_metadata: userMetadata,
      email_confirm: true,
    });
    if (updateError) throw new Error("Failed to update Telegram user.");
    return { email, password };
  }

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (createError) throw new Error("Failed to create Telegram user.");
  return { email, password };
}

export async function POST(request) {
  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many Telegram login attempts." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const signatureValid = await verifyJwtSignature(body.id_token).catch((signatureError) => {
    console.error("[telegram-auth] token verification failed:", signatureError.message);
    return false;
  });
  if (!signatureValid) {
    return NextResponse.json({ error: "Telegram token signature is invalid." }, { status: 400 });
  }

  const payload = decodeJwtPayload(body.id_token);
  const { telegramUser, error } = verifyTelegramPayload(payload);
  if (error) return NextResponse.json({ error }, { status: 400 });

  let credentials;
  try {
    credentials = await ensureTelegramUser(telegramUser);
  } catch (authError) {
    console.error("[telegram-auth] user sync failed:", authError.message);
    return NextResponse.json({ error: "Telegram authentication failed." }, { status: 500 });
  }

  const { data, error: signInError } = await supabaseAuth.auth.signInWithPassword(credentials);
  if (signInError || !data?.session) {
    console.error("[telegram-auth] session creation failed:", signInError?.message);
    return NextResponse.json({ error: "Telegram authentication failed." }, { status: 500 });
  }

  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}

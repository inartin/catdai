import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPaidAccessTier, resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 20 });

const SLUG_LENGTH = 8;
const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateSlug() {
  const bytes = crypto.randomBytes(SLUG_LENGTH);
  let slug = "";
  for (let i = 0; i < SLUG_LENGTH; i++) {
    slug += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  }
  return slug;
}

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

/** Canonical key for deduplication: sorted JSON of the evaluation params. */
function canonicalParams(params) {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      if (params[key] != null && params[key] !== "") {
        acc[key] = params[key];
      }
      return acc;
    }, {});
  return sorted;
}

const PARAM_KEYS = [
  "city",
  "district",
  "rooms",
  "area",
  "floor",
  "first_floor",
  "last_floor",
  "total_floors",
  "building_type",
  "renovation",
  "bathrooms",
  "balconies",
  "cadastral_number",
];

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed, remaining, retryAfter } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.city || !body.district || !body.rooms) {
    return NextResponse.json(
      { error: "Missing required params: city, district, rooms" },
      { status: 400 }
    );
  }

  // Build canonical params object (sorted keys, non-empty values only)
  const params = {};
  for (const key of PARAM_KEYS) {
    if (body[key] != null && body[key] !== "") {
      params[key] = String(body[key]);
    }
  }
  const canonical = JSON.stringify(canonicalParams(params));

  // SHA-256 hash of canonical JSON — used as the reliable dedup key
  const paramsHash = crypto.createHash("sha256").update(canonical).digest("hex");

  // Resolve access tier of the sharer
  const access = await resolveAccessTier(request);
  const sharerIsPaid = isPaidAccessTier(access.tier);
  const sharerUserId = access.user_id || null;

  // Deduplication: look up by (sharer_user_id, params_hash) for logged-in users,
  // or by (params_hash alone) for anonymous users — hash is always reliable.
  {
    let query = supabaseAdmin
      .from("shared_links")
      .select("slug")
      .eq("params_hash", paramsHash);

    if (sharerUserId) {
      query = query.eq("sharer_user_id", sharerUserId);
    } else {
      query = query.is("sharer_user_id", null);
    }

    const { data: existing } = await query.maybeSingle();

    if (existing?.slug) {
      const appUrl = getAppBaseUrl(request);
      return NextResponse.json(
        { url: `${appUrl}/imobil/${existing.slug}`, slug: existing.slug },
        { headers: { "X-RateLimit-Remaining": String(remaining) } }
      );
    }
  }

  // Generate unique slug (retry on collision)
  let slug;
  let attempts = 0;
  while (attempts < 5) {
    slug = generateSlug();
    const { data: collision } = await supabaseAdmin
      .from("shared_links")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (!collision) break;
    attempts++;
  }

  if (attempts >= 5) {
    return NextResponse.json(
      { error: "Failed to generate unique link. Please try again." },
      { status: 500 }
    );
  }

  // Insert shared link with params_hash for future dedup lookups
  const { error: insertError } = await supabaseAdmin
    .from("shared_links")
    .insert({
      slug,
      params: JSON.parse(canonical),
      params_hash: paramsHash,
      sharer_user_id: sharerUserId,
      sharer_is_paid: sharerIsPaid,
    });

  if (insertError) {
    console.error("[share] insert failed:", insertError.message);
    return NextResponse.json(
      { error: "Failed to create shared link." },
      { status: 500 }
    );
  }

  const appUrl = getAppBaseUrl(request);
  const res = NextResponse.json({ url: `${appUrl}/imobil/${slug}`, slug });
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}


function getAppBaseUrl(request) {
  // In production, use the canonical domain
  const host = request.headers.get("host") || "";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host.includes("catdai.md")) return "https://catdai.md";
  return `${proto}://${host}`;
}

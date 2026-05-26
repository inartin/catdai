import crypto from "node:crypto";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { fetchListingPreviewImage } from "@/lib/listing-preview-images";
import { NextResponse } from "next/server";

const MAX_LISTINGS = 6;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const CACHE_PREFIX = "catdai:listing-preview-image:v1:";

function normalizeLanguage(language) {
  return language === "ru" ? "ru" : "ro";
}

function makeCacheKey(externalId, language) {
  const hash = crypto
    .createHash("sha256")
    .update(`${normalizeLanguage(language)}:${String(externalId)}`)
    .digest("hex")
    .slice(0, 32);

  return `${CACHE_PREFIX}${hash}`;
}

function normalizeExternalIds(value) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(
    raw
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  )].slice(0, MAX_LISTINGS);
}

async function resolvePreviewImage(externalId, language) {
  const cacheKey = makeCacheKey(externalId, language);
  const cached = await getSharedCache(cacheKey);
  if (cached?.value && typeof cached.value.image_url === "string") {
    return cached.value.image_url || null;
  }

  const imageUrl = await fetchListingPreviewImage(externalId, language);
  await setSharedCache(cacheKey, { image_url: imageUrl || "" }, CACHE_TTL_SECONDS);
  return imageUrl;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const language = normalizeLanguage(body.language);
  const externalIds = normalizeExternalIds(body.external_ids);
  if (externalIds.length === 0) {
    return NextResponse.json({ images: {} });
  }

  const entries = await Promise.all(
    externalIds.map(async (externalId) => [
      externalId,
      await resolvePreviewImage(externalId, language),
    ])
  );

  return NextResponse.json({
    images: Object.fromEntries(entries.filter(([, imageUrl]) => imageUrl)),
  });
}

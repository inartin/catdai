import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTextFromNewsHtml, sanitizeNewsHtml } from "@/lib/news-content";
import { createUniqueNewsSlug, NEWS_POST_BASE_SELECT, NEWS_POST_SELECT, slugifyNewsTitle } from "@/lib/news-posts";

const PAGE_SIZE = 100;
const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 1000;

function normalizeText(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function normalizeNewsPayload(body) {
  const title = normalizeText(body?.title).slice(0, MAX_TITLE_LENGTH);
  const description = sanitizeNewsHtml(body?.description);
  const descriptionText = getTextFromNewsHtml(description).slice(0, MAX_DESCRIPTION_LENGTH);
  const coverImageUrl = normalizeText(body?.cover_image_url).slice(0, MAX_IMAGE_URL_LENGTH);
  const hasDescriptionImage = /<img\b/i.test(description);

  if (!title) return { error: "Title is required." };
  if (!descriptionText && !hasDescriptionImage) return { error: "Description is required." };

  return {
    payload: {
      title,
      description,
      cover_image_url: coverImageUrl || null,
    },
  };
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  let { data, error } = await supabaseAdmin
    .from("news_posts")
    .select(NEWS_POST_SELECT)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    const fallback = await supabaseAdmin
      .from("news_posts")
      .select(NEWS_POST_BASE_SELECT)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (!fallback.error) {
      data = (fallback.data || []).map((row) => ({ ...row, slug: slugifyNewsTitle(row.title) }));
      error = null;
    }
  }

  if (error) {
    console.error("[admin-news] list failed:", error.message);
    return NextResponse.json({ error: "Failed to load news." }, { status: 500 });
  }

  return NextResponse.json({ news: data || [] });
}

export async function POST(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const { payload, error: validationError } = normalizeNewsPayload(body);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  let slug;
  try {
    slug = await createUniqueNewsSlug(payload.title);
  } catch (slugError) {
    console.error("[admin-news] slug create failed:", slugError.message);
    return NextResponse.json({ error: "Failed to create news slug." }, { status: 500 });
  }

  const insertPayload = slug ? { ...payload, slug } : payload;

  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .insert(insertPayload)
    .select(NEWS_POST_SELECT)
    .single();

  if (error) {
    if (String(error.message || "").includes("slug")) {
      const fallback = await supabaseAdmin
        .from("news_posts")
        .insert(payload)
        .select(NEWS_POST_BASE_SELECT)
        .single();

      if (!fallback.error) {
        return NextResponse.json({ news: { ...fallback.data, slug: slugifyNewsTitle(fallback.data.title) } }, { status: 201 });
      }
    }

    console.error("[admin-news] create failed:", error.message);
    return NextResponse.json({ error: "Failed to create news." }, { status: 500 });
  }

  return NextResponse.json({ news: data }, { status: 201 });
}

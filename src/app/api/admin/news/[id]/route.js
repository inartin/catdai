import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTextFromNewsHtml, sanitizeNewsHtml } from "@/lib/news-content";
import { NEWS_POST_BASE_SELECT, NEWS_POST_SELECT, slugifyNewsTitle } from "@/lib/news-posts";

const MAX_TITLE_LENGTH = 180;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function validateId(id) {
  return UUID_RE.test(String(id || ""));
}

export async function PATCH(request, { params }) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!validateId(id)) {
    return NextResponse.json({ error: "Invalid news id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const { payload, error: validationError } = normalizeNewsPayload(body);

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .update(payload)
    .eq("id", id)
    .select(NEWS_POST_SELECT)
    .single();

  if (error) {
    if (String(error.message || "").includes("slug")) {
      const fallback = await supabaseAdmin
        .from("news_posts")
        .update(payload)
        .eq("id", id)
        .select(NEWS_POST_BASE_SELECT)
        .single();

      if (!fallback.error) {
        return NextResponse.json({ news: { ...fallback.data, slug: slugifyNewsTitle(fallback.data.title) } });
      }
    }

    console.error("[admin-news] update failed:", error.message);
    return NextResponse.json({ error: "Failed to update news." }, { status: 500 });
  }

  return NextResponse.json({ news: data });
}

export async function DELETE(request, { params }) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!validateId(id)) {
    return NextResponse.json({ error: "Invalid news id." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("news_posts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin-news] delete failed:", error.message);
    return NextResponse.json({ error: "Failed to remove news." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

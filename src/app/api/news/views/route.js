import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isValidNewsPostId } from "@/lib/news-upvotes";
import { fetchNewsViewCounts } from "@/lib/news-views";
import { rateLimit } from "@/lib/rate-limit";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { getCanonicalSiteUrl } from "@/lib/seo";
import {
  createNewsVisitorCookie,
  readNewsVisitorCookie,
  NEWS_VISITOR_COOKIE,
  NEWS_VISITOR_MAX_AGE,
} from "@/lib/news-visitor-cookie";

const limiter = rateLimit({ interval: 60_000, limit: 30, namespace: "news-views" });

function setVisitorCookie(response, token, request) {
  response.cookies.set(NEWS_VISITOR_COOKIE, token, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:"
      || request.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/api/news/views",
    maxAge: NEWS_VISITOR_MAX_AGE,
  });
  return response;
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  // The reverse proxy can expose the public HTTPS site while request.url
  // contains the internal HTTP origin. Keep the configured public origin valid.
  if (origin && origin !== new URL(request.url).origin && origin !== getCanonicalSiteUrl()) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const ip = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || request.headers.get("x-real-ip") || "unknown";
  if (!limiter.check(ip).allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const postId = body?.post_id;
  if (!isValidNewsPostId(postId)) {
    return NextResponse.json({ error: "Invalid post_id." }, { status: 400 });
  }

  let visitorToken;
  if (shouldPersistRuntimeData()) {
    let visitorId;
    try {
      visitorId = readNewsVisitorCookie(request.cookies.get(NEWS_VISITOR_COOKIE)?.value);
      visitorToken = createNewsVisitorCookie(visitorId || undefined);
    } catch (error) {
      console.error("[news-views] cookie signing failed:", error.message);
      return NextResponse.json({ error: "View tracking is not configured." }, { status: 503 });
    }

    if (!visitorId) {
      // Count only after the browser sends a valid cookie back. This avoids
      // generating a fresh counted visitor on every cookie-blocked request.
      return setVisitorCookie(NextResponse.json({ cookie_required: true }, {
        headers: { "Cache-Control": "no-store" },
      }), visitorToken, request);
    }

    const { error } = await supabaseAdmin.from("news_post_views").upsert(
      { news_post_id: postId, visitor_id: visitorId },
      { onConflict: "news_post_id,visitor_id", ignoreDuplicates: true }
    );
    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "News post not found." }, { status: 404 });
      }
      console.error("[news-views] insert failed:", error.message);
      return NextResponse.json({ error: "Failed to record view." }, { status: 503 });
    }
  }

  const counts = await fetchNewsViewCounts([postId]);
  const response = NextResponse.json({ count: counts[postId] || 0 }, {
    headers: { "Cache-Control": "no-store" },
  });
  return visitorToken ? setVisitorCookie(response, visitorToken, request) : response;
}

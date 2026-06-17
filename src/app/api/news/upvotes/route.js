import { resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import {
  fetchNewsPostUpvoteCount,
  hasUserUpvotedNewsPost,
  isMissingNewsUpvoteSchema,
  isValidNewsPostId,
} from "@/lib/news-upvotes";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 20 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

async function newsPostExists(postId) {
  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .select("id")
    .eq("id", postId)
    .maybeSingle();

  if (error) {
    console.error("[news-upvotes] post lookup failed:", error.message);
    return false;
  }

  return !!data;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("post_id");

  if (!isValidNewsPostId(postId)) {
    return NextResponse.json({ error: "Invalid post_id." }, { status: 400 });
  }

  const access = await resolveAccessTier(request);
  const [count, upvoted] = await Promise.all([
    fetchNewsPostUpvoteCount(postId),
    hasUserUpvotedNewsPost(postId, access.user_id),
  ]);

  return NextResponse.json({ count, upvoted });
}

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const postId = body?.post_id;
  if (!isValidNewsPostId(postId)) {
    return NextResponse.json({ error: "Invalid post_id." }, { status: 400 });
  }

  const exists = await newsPostExists(postId);
  if (!exists) {
    return NextResponse.json({ error: "News post not found." }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("news_post_upvotes")
    .insert({
      news_post_id: postId,
      user_id: access.user_id,
    });

  if (error && error.code !== "23505") {
    if (isMissingNewsUpvoteSchema(error)) {
      return NextResponse.json({ error: "News upvotes table is not configured." }, { status: 500 });
    }

    console.error("[news-upvotes] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to upvote." }, { status: 500 });
  }

  const count = await fetchNewsPostUpvoteCount(postId);
  return NextResponse.json({ count, upvoted: true });
}

import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRequestVisitor } from "@/lib/visitor";
import { cleanReviewComment, getReviewState } from "@/lib/result-reviews";

const limiter = rateLimit({ interval: 60_000, limit: 30, namespace: "result-reviews" });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function reviewer(request) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const limit = limiter.check(ip);
  if (!limit.allowed) return { response: json({ error: "Too many requests." }, 429) };
  const { data, error } = await getRequestUser(request);
  // Anonymous Supabase checkout sessions are accepted without registration.
  if (error || !data?.user?.id) return { response: json({ error: "A checkout session is required." }, 401) };
  return { user: data.user };
}

export async function GET(request) {
  const { user, response } = await reviewer(request);
  if (response) return response;
  const usageId = new URL(request.url).searchParams.get("usage_id");
  if (!uuid.test(usageId || "")) return json({ error: "Invalid result." }, 400);
  try {
    const state = await getReviewState(user.id, usageId);
    return json({ eligible: state.eligible });
  } catch (error) {
    console.error("[result-reviews] eligibility failed:", error.message);
    return json({ error: "Review unavailable." }, 503);
  }
}

export async function POST(request) {
  const { user, response } = await reviewer(request);
  if (response) return response;
  let body;
  let comment;
  try {
    body = await request.json();
    if (!body || typeof body.usage_id !== "string" || !uuid.test(body.usage_id) || !["submit", "dismiss"].includes(body.action)) throw new Error();
    if (body.action === "submit" && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) throw new Error();
    comment = body.action === "submit" ? cleanReviewComment(body.comment) : null;
  } catch {
    return json({ error: "Invalid review. Choose 1 to 5 stars and an optional comment up to 500 characters." }, 400);
  }
  try {
    const state = await getReviewState(user.id, body.usage_id);
    if (state.responded) return json({ ok: true, eligible: false });
    if (!state.eligible) return json({ error: "An unlocked paid result is required." }, 403);
    const { error } = await supabaseAdmin.from("result_reviews").insert({
      user_id: user.id,
      usage_event_id: state.usage.id,
      feature_key: state.usage.feature_key,
      is_anonymous: user.is_anonymous === true,
      visitor: getRequestVisitor(request),
      status: body.action === "submit" ? "submitted" : "dismissed",
      rating: body.action === "submit" ? body.rating : null,
      comment,
    });
    // Concurrent submissions keep the first response; retries never replace it.
    if (error && error.code !== "23505") throw error;
    return json({ ok: true, eligible: false });
  } catch (error) {
    console.error("[result-reviews] save failed:", error.message);
    return json({ error: "Failed to save review." }, 500);
  }
}

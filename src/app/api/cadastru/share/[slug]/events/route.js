import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { shouldCollectStatistics, withStatisticsContext } from "@/lib/statistics-context";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { rateLimit } from "@/lib/rate-limit";
import { getCanonicalSiteUrl } from "@/lib/seo";
import { CADASTRU_SHARE_VISITOR_COOKIE, CADASTRU_SHARE_VISITOR_MAX_AGE,
  createCadastruShareVisitorCookie, readCadastruShareVisitorCookie } from "@/lib/cadastru-share-visitor";

const limiter = rateLimit({ interval: 60_000, limit: 60, namespace: "cadastru-share-events" });

async function handlePost(request, { params }) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== getCanonicalSiteUrl()) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403, headers });
  }
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!limiter.check(ip).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  const { slug } = await params;
  if (!/^[a-f0-9]{48}$/.test(slug)) return NextResponse.json({ error: "invalid_slug" }, { status: 400, headers });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (!["share", "open"].includes(body?.event)
    || (body.event === "share" && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.event_id || ""))) {
    return NextResponse.json({ error: "invalid_event" }, { status: 400, headers });
  }
  if (!shouldCollectStatistics() || !shouldPersistRuntimeData() || process.env.NODE_ENV === "development") {
    return NextResponse.json({ ok: true }, { headers });
  }
  try {
    const { data: report, error } = await supabaseAdmin.from("cadastru_shared_reports")
      .select("sharer_user_id, collect_statistics").eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!report) return NextResponse.json({ error: "report_not_found" }, { status: 404, headers });
    const access = await resolveAccessTier(request);
    if (!report.collect_statistics || (body.event === "open" && access.user_id && access.user_id === report.sharer_user_id)) {
      return NextResponse.json({ ok: true }, { headers });
    }
    let viewerKey = null;
    if (body.event === "open") {
      if (access.user_id) viewerKey = `user:${access.user_id}`;
      else {
        const visitor = readCadastruShareVisitorCookie(request.cookies.get(CADASTRU_SHARE_VISITOR_COOKIE)?.value);
        if (!visitor) {
          const response = NextResponse.json({ cookie_required: true }, { headers });
          response.cookies.set(CADASTRU_SHARE_VISITOR_COOKIE, createCadastruShareVisitorCookie(), {
            httpOnly: true, secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
            sameSite: "lax", path: "/api/cadastru/share", maxAge: CADASTRU_SHARE_VISITOR_MAX_AGE,
          });
          return response;
        }
        viewerKey = `browser:${visitor}`;
      }
    }
    const { error: insertError } = await supabaseAdmin.from("cadastru_share_events").upsert({
      id: body.event === "share" ? body.event_id : crypto.randomUUID(),
      report_slug: slug, event_type: body.event, viewer_key: viewerKey,
    }, { onConflict: body.event === "share" ? "id" : "report_slug,event_type,viewer_key", ignoreDuplicates: true });
    if (insertError) throw insertError;
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[cadastru/share] statistics write failed:", error.message);
    return NextResponse.json({ error: "statistics_unavailable" }, { status: 503, headers });
  }
}

export const POST = withStatisticsContext(handlePost);

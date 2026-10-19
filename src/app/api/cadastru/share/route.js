import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { checkFeatureAccess, makePaidFeatureUsageKey } from "@/lib/paid-feature-usage";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { cleanCadastruPayload } from "@/lib/cadastru-cache";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { shouldCollectStatistics, withStatisticsContext } from "@/lib/statistics-context";
import { rateLimit } from "@/lib/rate-limit";
import { validateCadastralNumber } from "@/lib/validation";
import { resolveCadastruShareSearch } from "@/lib/cadastru-share-statistics";

const limiter = rateLimit({ interval: 60_000, limit: 20, namespace: "cadastru-share" });

async function handlePost(request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, retryAfter } = limiter.check(ip);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, {
    status: 429, headers: { "Retry-After": String(retryAfter) },
  });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const number = typeof body?.cadastral_number === "string" ? body.cadastral_number.trim() : "";
  const address = typeof body?.address === "string" ? body.address.replace(/\s+/g, " ").trim() : "";
  const validation = validateCadastralNumber(number);
  if (number ? !validation.valid : !address || address.length > 500) {
    return NextResponse.json({ error: "invalid_search" }, { status: 400 });
  }

  try {
    const access = await resolveAccessTier(request);
    if (!access.user_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!shouldPersistRuntimeData()) {
      return NextResponse.json({ error: "sharing_unavailable" }, { status: 503 });
    }

    // Read the official server result; never publish a client-supplied report.
    const entry = number
      ? await getCadastruRecordByNumber(validation.value, { allowExpired: true })
      : await getCadastruRecordByAddress(address, { allowExpired: true });
    const payload = entry?.payload;
    if (!payload || payload.error || payload.locked_sections?.cadastru_details
      || (payload.status && payload.status !== "success")) {
      return NextResponse.json({ error: "result_not_found" }, { status: 404 });
    }

    const usageNumber = number ? validation.value : payload.cadastral_number;
    const idempotencyKey = makePaidFeatureUsageKey("cadastru_lookup", usageNumber
      ? { cadastral_number: usageNumber }
      : { address: address.toLowerCase() });
    const credit = await checkFeatureAccess({
      userId: access.user_id, featureKey: "cadastru_lookup", idempotencyKey,
    });
    // Sharing reuses an unlocked lookup and must never spend a new credit.
    if (!credit.allowed || (credit.reason !== "already_consumed" && process.env.NODE_ENV !== "development")) {
      return NextResponse.json({ error: "report_not_unlocked" }, { status: 403 });
    }

    const snapshot = cleanCadastruPayload(payload);
    delete snapshot.cadastru_evaluation_token;
    snapshot.locked_sections = {};
    const searchEventId = await resolveCadastruShareSearch(body.search_token, access.user_id, usageNumber, address, payload);
    const reportHash = makePaidFeatureUsageKey("cadastru_share", searchEventId ? { snapshot, search_event_id: searchEventId } : snapshot);
    const findExisting = () => supabaseAdmin.from("cadastru_shared_reports").select("slug")
      .eq("sharer_user_id", access.user_id).eq("report_hash", reportHash).maybeSingle();
    let { data: existing, error } = await findExisting();
    if (error) throw error;
    let slug = existing?.slug;
    if (!slug) {
      slug = crypto.randomBytes(24).toString("hex");
      const result = await supabaseAdmin.from("cadastru_shared_reports").insert({
        slug, sharer_user_id: access.user_id, report_hash: reportHash,
        payload: snapshot, collect_statistics: shouldCollectStatistics(), search_event_id: searchEventId,
      });
      if (result.error?.code === "23505") {
        // Concurrent clicks for the same snapshot return the first saved link.
        ({ data: existing, error } = await findExisting());
        if (error || !existing?.slug) throw error || result.error;
        slug = existing.slug;
      } else if (result.error) throw result.error;
    }

    const lang = body.lang === "ru" ? "ru" : "ro";
    const origin = process.env.NODE_ENV === "production" ? "https://catdai.md" : new URL(request.url).origin;
    return NextResponse.json({ slug, url: `${origin}/${lang}/cadastru/rezultat?share_slug=${slug}` });
  } catch (error) {
    console.error("[cadastru/share] create failed:", error.message);
    return NextResponse.json({ error: "sharing_unavailable" }, { status: 503 });
  }
}

export const POST = withStatisticsContext(handlePost);

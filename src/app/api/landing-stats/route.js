import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
let cache = { data: null, ts: 0 };

function isMissingEstimateTypeError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "PGRST204" || code === "42703") && message.includes("estimate_type");
}

async function countRows(table) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count || 0;
}

async function countSaleEvaluations() {
  const [totalResult, rentResult] = await Promise.all([
    supabaseAdmin.from("estimate_log").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("estimate_log")
      .select("*", { count: "exact", head: true })
      .eq("estimate_type", "rent"),
  ]);

  if (totalResult.error) {
    throw new Error(`estimate_log count failed: ${totalResult.error.message}`);
  }

  const total = totalResult.count || 0;
  if (rentResult.error) {
    if (isMissingEstimateTypeError(rentResult.error)) return total;
    throw new Error(`estimate_log rent count failed: ${rentResult.error.message}`);
  }

  return Math.max(total - (rentResult.count || 0), 0);
}

export async function GET() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  }

  try {
    const [evaluations, cadastruSearches, listingLinkAnalyses] = await Promise.all([
      countSaleEvaluations(),
      countRows("cadastru_search_events"),
      countRows("listing_link_analysis_events"),
    ]);

    const data = { evaluations, cadastruSearches, listingLinkAnalyses };
    cache = { data, ts: Date.now() };

    return NextResponse.json(data, {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  } catch (error) {
    console.error("[landing-stats] failed:", error.message);
    return NextResponse.json({ error: "Landing stats unavailable" }, { status: 503 });
  }
}

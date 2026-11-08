import { getStatisticsUserId, getStatisticsVisitor, shouldCollectStatistics } from "@/lib/statistics-context";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { normalizeCadastruLookupId } from "@/lib/cadastru-lookup-tracking";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CADASTRU_RESULT_CATEGORIES } from "@/lib/cadastru-result-categories";

// Set only successful categories. Independent column updates preserve successes
// across concurrent secondary responses, login reloads and failed retries.
export async function recordCadastruResultCategories(lookupId, categories) {
  const id = normalizeCadastruLookupId(lookupId);
  const visitorId = getStatisticsVisitor()?.device_id;
  const userId = getStatisticsUserId();
  if (!id || (!visitorId && !userId) || process.env.NODE_ENV === "development"
    || !shouldCollectStatistics() || !shouldPersistRuntimeData()) return;
  const values = Object.fromEntries(CADASTRU_RESULT_CATEGORIES
    .filter(([key]) => categories[key] === true).map(([key]) => [key, true]));
  if (!Object.keys(values).length) return;
  try {
    let query = supabaseAdmin.from("cadastru_search_events").update(values)
      .eq("lookup_id", id).is("duplicate_of", null);
    if (visitorId) {
      query = query.eq("visitor->>device_id", visitorId);
      if (userId) query = query.or(`user_id.is.null,user_id.eq.${userId}`);
    }
    // Anonymous calls can finish after login, but must never update another browser.
    else query = query.eq("user_id", userId);
    const { error } = await query;
    if (error && !["42P01", "42703", "PGRST204"].includes(String(error.code))) throw error;
  } catch (error) {
    console.error("[cadastru-result-categories] update failed:", error?.message || String(error));
  }
}

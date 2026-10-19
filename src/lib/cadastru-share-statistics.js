import { supabaseAdmin } from "@/lib/supabase-admin";
import { readCadastruEvaluationToken } from "@/lib/cadastru-evaluation-tracking";

const normalizeAddress = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

export async function resolveCadastruShareSearch(token, userId, number, address, payload) {
  const id = readCadastruEvaluationToken(token);
  if (!id) return null;
  const { data, error } = await supabaseAdmin.from("cadastru_search_events")
    .select("id, cadastral_number, search_address").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (number && data.cadastral_number) return data.cadastral_number === number ? data.id : null;
  const sameAddress = data.search_address && [!number && address, payload.request_address, payload.resolved_address]
    .some((value) => value && normalizeAddress(value) === normalizeAddress(data.search_address));
  return sameAddress ? data.id : null;
}

export async function loadCadastruShareStatistics(searches) {
  if (!searches.length) return searches;
  const { data, error } = await supabaseAdmin.rpc("cadastru_share_statistics", {
    p_search_ids: searches.map((search) => search.id),
  });
  if (error) throw new Error(`Cadastru share statistics unavailable: ${error.message}`);
  const stats = new Map((data || []).map((row) => [String(row.search_event_id), row]));
  return searches.map((search) => ({ ...search,
    share_count: Number(stats.get(String(search.id))?.share_count || 0),
    unique_viewers: Number(stats.get(String(search.id))?.unique_viewers || 0),
  }));
}

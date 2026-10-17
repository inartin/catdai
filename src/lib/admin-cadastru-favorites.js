import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSavedCadastruAddress } from "@/lib/cadastru-favorites";

const PAGE_SIZE = 1000;

function normalizeAddress(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:str|strada)\b\.?/g, "strada")
    .replace(/\b(?:bd|bulevardul|bulevard)\b\.?/g, "bulevard")
    .replace(/[,;]/g, " ").replace(/\s+/g, " ").trim();
}

function addressKey(address) {
  if (!address?.city || !address.road_type || !address.street || !address.house_number) return "";
  return normalizeAddress(`${address.city}, ${address.road_type} ${address.street} ${address.house_number}${address.apartment_number ? ` ap ${address.apartment_number}` : ""}`);
}

export function attachCadastruFavorites(searches, favorites) {
  const keys = new Set();
  for (const favorite of favorites) {
    if (!favorite.user_id || !favorite.url_path) continue;
    let url;
    try { url = new URL(favorite.url_path, "https://catdai.md"); } catch { continue; }
    if (!/^\/(?:ro\/|ru\/)?cadastru\/rezultat\/?$/.test(url.pathname)) continue;
    const number = url.searchParams.get("cadastral_number")?.trim();
    const address = getSavedCadastruAddress(url.searchParams);
    if (number) keys.add(`${favorite.user_id}|number|${number}`);
    if (address) keys.add(`${favorite.user_id}|address|${addressKey(address)}`);
  }

  return searches.map((search) => {
    const address = normalizeAddress(search.search_address);
    const favorited = Boolean(search.user_id && (
      (search.cadastral_number && keys.has(`${search.user_id}|number|${search.cadastral_number.trim()}`))
      || (search.search_type === "address" && address && keys.has(`${search.user_id}|address|${address}`))
    ));
    return { ...search, favorited };
  });
}

// Read current bookmarks regardless of the search/dashboard period. A result
// saved later still belongs to this user; removed bookmarks no longer match.
export async function loadCadastruFavorites(searches) {
  const userIds = [...new Set(searches.map((search) => search.user_id).filter(Boolean))];
  if (!userIds.length) return attachCadastruFavorites(searches, []);
  const favorites = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.from("user_favorites")
      .select("id, user_id, url_path").in("user_id", userIds)
      .order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Cadastru favorites query failed: ${error.message}`);
    favorites.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return attachCadastruFavorites(searches, favorites);
}

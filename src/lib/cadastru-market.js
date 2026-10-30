import { nearbyAddressFromCadastru } from "@/lib/cadastru-nearby";
import { normalizeStreetName, resolveStreet } from "@/lib/cadastru-streets/street-resolver";
import { matchCity, matchDistrict } from "@/lib/validation";

const MAX_STREET_LISTINGS = 1000;
const FIELDS = "id,external_id,is_active,price_amount,price_currency,price_per_m2,area_m2,rooms_count,floor,total_floors,renovation,first_seen_at,last_seen_at,attributes";
const roadKey = (value) => ({ strada: "str", bulevard: "bd", "str-la": "str-la", sos: "sos" })[value];
const houseKey = (value) => String(value || "").trim().replace(/[.,;]+$/, "").replace(/\s+/g, "").toLowerCase();
const positive = (value) => value != null && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

function streetIdentity(city, road, street) {
  const resolved = resolveStreet({ city, roadType: road, street, exactOnly: true });
  return resolved.status === "exact" ? normalizeStreetName(resolved.street) : null;
}

function listingHouse(row, input) {
  const street = String(row.attributes?.sourceStreet || "").trim();
  const markerMatch = street.match(/^(?:[-–]\s*)?(str-la|stradela|strădela|strada|str|bd|bul|bulevardul|bulevard|sos|șos|şos|soseaua|șoseaua|şoseaua|шоссе|бд|бул|бульвар|ул|улица|проспект|пр)(?=[.\s])/iu);
  const marker = markerMatch?.[1]?.toLowerCase();
  const name = markerMatch ? street.slice(markerMatch[0].length).replace(/^[.\s]+/, "") : street;
  const road = /^(?:bd|bul|bulevard|bulevardul|бд|бул|бульвар|проспект|пр)$/.test(marker || "") ? "bd"
    : /^(?:str-la|stradela|strădela)$/.test(marker || "") ? "str-la"
    : /^(?:sos|șos|şos|soseaua|șoseaua|şoseaua|шоссе)$/.test(marker || "") ? "sos"
    : marker ? "str" : null;
  // A missing road type is safe only if the catalogue identifies this street
  // under exactly one road type in this locality.
  const possible = road ? [road] : ["str", "bd", "str-la", "sos"].filter((type) => streetIdentity(input.city, type, name));
  if (possible.length !== 1 || possible[0] !== roadKey(input.road_type)) return null;
  if (streetIdentity(input.city, possible[0], name) !== streetIdentity(input.city, roadKey(input.road_type), input.street)) return null;
  const house = houseKey(row.attributes?.sourceBuildingNumber);
  return /^\d{1,4}[a-zа-я]?(?:\/[\da-zа-я]+)?$/iu.test(house) ? house : null;
}

async function readAreaTrend(db, city, district) {
  if (city !== "Chișinău" || !district) return null;
  const { data, error } = await db.from("daily_price_snapshot")
    .select("snapshot_date,building_type,median_ppm")
    .eq("district", district).in("building_type", ["Construcţii noi", "Secundar"])
    .gte("snapshot_date", "2026-07-01").lte("snapshot_date", new Date().toISOString().slice(0, 10))
    .order("snapshot_date", { ascending: true }).limit(1000);
  if (error) throw error;
  const series = [{ key: "constructii_noi", name: "Construcţii noi" }, { key: "secundar", name: "Secundar" }]
    .map(({ key, name }) => ({ key, points: (data || []).filter((row) => row.building_type === name && positive(row.median_ppm))
      .map((row) => ({ date: row.snapshot_date, value: Math.round(Number(row.median_ppm)) })) }))
    .filter((item) => item.points.length >= 2);
  return series.length ? { scope: "district", name: district, series } : null;
}

async function readListings(db, input) {
  if (!input) return { houses: [], listings: [] };
  const resolved = resolveStreet({ city: input.city, roadType: roadKey(input.road_type), street: input.street, exactOnly: true, includeAliases: true });
  if (resolved.status !== "exact") return { houses: [], listings: [] };
  const names = [...new Set([input.street, resolved.street, ...(resolved.aliases || [])])]
    .map((name) => name.replace(/[^\p{L}\p{N} -]/gu, "").trim()).filter(Boolean);
  const { data, error } = await db.from("listing").select(FIELDS).eq("city", input.city)
    .or(names.map((name) => `attributes->>sourceStreet.ilike.%${name}%`).join(","))
    .order("last_seen_at", { ascending: false }).limit(MAX_STREET_LISTINGS + 1);
  if (error) throw error;
  // Never present a truncated street query as an exact collected-ad count.
  if (data?.length > MAX_STREET_LISTINGS) return { houses: [], listings: [] };
  const matched = (data || []).map((row) => ({ ...row, house: listingHouse(row, input) }))
    .filter((row) => row.house);
  const priced = matched.filter((row) => row.price_currency === "EUR" && positive(row.price_amount));
  const current = houseKey(input.house_number);
  const others = [...new Set(priced.map((row) => row.house))].filter((house) => house !== current)
    .sort((a, b) => Math.abs(parseInt(a) - parseInt(current)) - Math.abs(parseInt(b) - parseInt(current)) || a.localeCompare(b)).slice(0, 3);
  const chosen = priced.filter((row) => [current, ...others].includes(row.house));
  const histories = new Map();
  // History failures must not suppress current prices or a usable sector trend.
  try {
    for (let start = 0; start < chosen.length; start += 100) {
      const ids = chosen.slice(start, start + 100).map((row) => row.id);
      for (let page = 0; page < 10; page++) {
        const { data: history, error: historyError } = await db.from("listing_price_history")
          .select("listing_id,observed_at,price_amount,price_currency").in("listing_id", ids)
          .eq("price_currency", "EUR").order("observed_at", { ascending: true }).order("id", { ascending: true })
          .range(page * 1000, page * 1000 + 999);
        if (historyError) throw historyError;
        if (page === 9 && history?.length === 1000) throw new Error("History limit exceeded");
        for (const point of history || []) {
          if (!positive(point.price_amount) || !Number.isFinite(Date.parse(point.observed_at))) continue;
          if (!histories.has(point.listing_id)) histories.set(point.listing_id, []);
          histories.get(point.listing_id).push([point.observed_at, Number(point.price_amount)]);
        }
        if (!history || history.length < 1000) break;
      }
    }
  } catch (error) { histories.clear(); console.error("[cadastru-market] history unavailable:", error.message); }
  const prefix = input.road_type === "bulevard" ? "bd." : input.road_type === "str-la" ? "str-la" : input.road_type === "sos" ? "șos." : "str.";
  const currentRows = matched.filter((row) => row.house === current);
  const collectedSince = currentRows.map((row) => row.first_seen_at).filter((value) => Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
  return {
    collectedCount: new Set(currentRows.map((row) => row.id)).size,
    collectedSince,
    houses: [current, ...others].map((house) => ({ id: house === current ? "current" : house, address: `${prefix} ${resolved.street} ${house.toUpperCase()}`, distance: null })),
    listings: chosen.map((row) => ({ id: row.external_id || row.id, house: row.house === current ? "current" : row.house,
      active: row.is_active === true, rooms: row.rooms_count, area: positive(row.area_m2),
      floor: [row.floor, row.total_floors].filter((value) => value != null).join("/") || "-",
      renovationLabel: row.renovation, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, price: Number(row.price_amount),
      pricePerM2: positive(row.price_per_m2), sourceUrl: /^\d{5,12}$/.test(row.external_id || "") ? `https://999.md/ro/${row.external_id}` : null,
      history: histories.get(row.id) || [],
    })),
  };
}

export async function loadCadastruMarket(db, { payload = {}, address, city, district } = {}) {
  const input = nearbyAddressFromCadastru(address ? { ...payload, request_address: address } : payload);
  const resolvedCity = input?.city || matchCity(city || payload?.form_fields?.city || payload?.location?.city || "");
  const resolvedDistrict = resolvedCity === "Chișinău" ? (matchDistrict(payload?.district, resolvedCity) || matchDistrict(payload?.form_fields?.district, resolvedCity) || matchDistrict(district, resolvedCity)) : null;
  const [listingResult, trendResult] = await Promise.allSettled([
    readListings(db, input), readAreaTrend(db, resolvedCity, resolvedDistrict),
  ]);
  for (const result of [listingResult, trendResult]) if (result.status === "rejected") console.error("[cadastru-market] data unavailable:", result.reason?.message);
  const listings = listingResult.status === "fulfilled" ? listingResult.value : { houses: [], listings: [] };
  const areaTrend = trendResult.status === "fulfilled" ? trendResult.value : null;
  if (!listings.listings.length && !areaTrend) return null;
  return { ...listings, areaTrend, capturedAt: new Date().toISOString(),
    address: input ? `${input.city} · ${input.road_type === "bulevard" ? "bd." : input.road_type === "str-la" ? "str-la" : input.road_type === "sos" ? "șos." : "str."} ${input.street} ${input.house_number}` : resolvedDistrict || resolvedCity,
  };
}

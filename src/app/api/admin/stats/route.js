import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

const PAGE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0 };

const PERIODS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const EMPTY_PRICE_CHANGES = { total: 0, up: 0, down: 0, avgChange: 0, avgChangePct: 0 };

async function fetchAllRows(buildQuery) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] ?? "N/A";
    if (!map[k]) map[k] = { key: String(k), count: 0, totalPrice: 0, priceCount: 0 };
    map[k].count++;
    if (item.price_amount != null) {
      map[k].totalPrice += Number(item.price_amount);
      map[k].priceCount++;
    }
  }
  return Object.values(map)
    .map((g) => ({
      key: g.key,
      count: g.count,
      avgPrice: g.priceCount > 0 ? g.totalPrice / g.priceCount : null,
    }))
    .sort((a, b) => b.count - a.count);
}

async function fetchPriceChangeStats(cutoff) {
  const params = cutoff ? { since: cutoff } : {};
  const { data, error } = await supabaseAdmin.rpc("price_change_stats", params);
  if (error) return null;
  return data;
}

async function countAllUsers() {
  let total = 0;
  let page = 1;
  try {
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("Failed to list users:", error);
        break;
      }
      if (!data || !data.users) break;
      total += data.users.length;
      if (data.users.length < 1000) break;
      page++;
    }
  } catch (err) {
    console.error("Error in countAllUsers:", err);
  }
  return total;
}

async function fetchTelegramAlerts() {
  return fetchAllRows(() =>
    supabaseAdmin
      .from("user_listing_alerts")
      .select(
        "id, user_id, label, is_active, website_enabled, telegram_chat_id, base_filters, alert_filters, created_at, last_notified_at"
      )
      .eq("telegram_enabled", true)
      .order("created_at", { ascending: false })
  );
}

function userDisplayName(user) {
  const meta = user?.user_metadata || {};
  const composed = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();

  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    composed ||
    user?.email ||
    user?.phone ||
    user?.id ||
    "Unknown"
  );
}

async function fetchUsersById(userIds) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const users = new Map();
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("Failed to list users for ad tracking:", error.message);
      return users;
    }

    const chunk = data?.users || [];
    for (const user of chunk) {
      if (uniqueIds.includes(user.id)) {
        users.set(user.id, {
          id: user.id,
          name: userDisplayName(user),
          email: user.email || null,
        });
      }
    }

    if (users.size >= uniqueIds.length || chunk.length < 1000) break;
    page += 1;
  }

  return users;
}

function groupAdJourneys(events, usersById) {
  const groups = new Map();

  for (const event of events) {
    const key = event.session_id || event.device_id || `event:${event.created_at}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sessionId: event.session_id || null,
        deviceId: event.device_id || null,
        userId: null,
        user: null,
        firstSeenAt: event.created_at,
        lastSeenAt: event.created_at,
        eventCount: 0,
        events: [],
      });
    }

    const group = groups.get(key);
    group.eventCount += 1;
    group.events.push(event);

    if (event.user_id && !group.userId) {
      group.userId = event.user_id;
      group.user = usersById.get(event.user_id) || { id: event.user_id, name: event.user_id, email: null };
    }

    if (Date.parse(event.created_at) < Date.parse(group.firstSeenAt)) {
      group.firstSeenAt = event.created_at;
    }
    if (Date.parse(event.created_at) > Date.parse(group.lastSeenAt)) {
      group.lastSeenAt = event.created_at;
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      events: group.events.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    }))
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}

async function fetchZdgAdStats() {
  const { data, error } = await supabaseAdmin
    .from("ad_source_events")
    .select("event_name, user_id, device_id, session_id, path, referrer, metadata, created_at")
    .eq("source", "zdg")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (error.code === "42P01") {
      return { available: false, error: "ad_source_events table is missing.", events: [] };
    }
    console.error("Failed to load ZDG ad events:", error.message);
    return { available: false, error: "Failed to load ZDG ad events.", events: [] };
  }

  const events = Array.isArray(data) ? data : [];
  const usersById = await fetchUsersById(events.map((event) => event.user_id));
  const uniqueSessions = new Set(events.map((event) => event.session_id).filter(Boolean));
  const uniqueDevices = new Set(events.map((event) => event.device_id).filter(Boolean));
  const identifiedUsers = new Set(events.map((event) => event.user_id).filter(Boolean));
  const countsByEvent = events.reduce((acc, event) => {
    acc[event.event_name] = (acc[event.event_name] || 0) + 1;
    return acc;
  }, {});

  return {
    available: true,
    source: "zdg",
    totalEvents: events.length,
    uniqueSessions: uniqueSessions.size,
    uniqueDevices: uniqueDevices.size,
    identifiedUsers: identifiedUsers.size,
    countsByEvent,
    recentEvents: events,
    journeys: groupAdJourneys(events, usersById),
  };
}

export async function GET(request) {
  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";

  if (!bypassCache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const now = Date.now();
  const cutoffs = Object.fromEntries(
    Object.entries(PERIODS).map(([k, ms]) => [k, new Date(now - ms).toISOString()])
  );

  let dataResults;
  try {
    dataResults = await Promise.all([
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("listing")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin.from("owner").select("*", { count: "exact", head: true }),
      fetchAllRows(() =>
        supabaseAdmin
          .from("listing")
          .select(
            "price_amount, price_per_m2, area_m2, rooms_count, district, sector, city, renovation, building_type"
          )
          .eq("is_active", true)
      ),
      supabaseAdmin
        .from("listing")
        .select(
          "id, title, price_amount, price_currency, area_m2, rooms_count, district, sector, is_active, created_at, source_url"
        )
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("first_seen_at", cutoffs["24h"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("first_seen_at", cutoffs["7d"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("first_seen_at", cutoffs["30d"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("deleted_at", cutoffs["24h"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("deleted_at", cutoffs["7d"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("deleted_at", cutoffs["30d"]),
      fetchPriceChangeStats(cutoffs["24h"]),
      fetchPriceChangeStats(cutoffs["7d"]),
      fetchPriceChangeStats(cutoffs["30d"]),
      countAllUsers(),
      supabaseAdmin.from("estimate_log").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("shared_links").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("user_favorites").select("*", { count: "exact", head: true }),
      fetchTelegramAlerts(),
      fetchZdgAdStats(),
    ]);
  } catch (err) {
    console.error("Failed to load stats:", err);
    return NextResponse.json({ error: "Failed to load complete stats from database" }, { status: 500 });
  }

  const [
    countAll,
    countActive,
    countOwners,
    listings,
    recentRes,
    new24h,
    new7d,
    new30d,
    removed24h,
    removed7d,
    removed30d,
    pc24h,
    pc7d,
    pc30d,
    totalUsers,
    countEstimations,
    countSharedLinks,
    countFavorites,
    telegramAlerts,
    zdgAd,
  ] = dataResults;

  const priced = listings.filter((l) => l.price_amount != null);
  const prices = priced.map((l) => Number(l.price_amount));
  const pricesPerM2 = priced.map((l) => Number(l.price_per_m2)).filter(Boolean);
  const areas = listings.map((l) => Number(l.area_m2)).filter(Boolean);
  const avg = (arr) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const result = {
    totalUsers: totalUsers || 0,
    totalEstimations: countEstimations.count || 0,
    totalSharedLinks: countSharedLinks.count || 0,
    totalFavorites: countFavorites.count || 0,
    totalTelegramAlerts: telegramAlerts.length,
    telegramAlerts,
    zdgAd,
    totalListings: countAll.count || 0,
    activeListings: countActive.count || 0,
    totalOwners: countOwners.count || 0,
    avgPrice: avg(prices),
    avgPricePerM2: avg(pricesPerM2),
    avgArea: avg(areas),
    marketDirection: {
      "24h": {
        newListings: new24h.count || 0,
        removedListings: removed24h.count || 0,
        priceChanges: pc24h || EMPTY_PRICE_CHANGES,
      },
      "7d": {
        newListings: new7d.count || 0,
        removedListings: removed7d.count || 0,
        priceChanges: pc7d || EMPTY_PRICE_CHANGES,
      },
      "30d": {
        newListings: new30d.count || 0,
        removedListings: removed30d.count || 0,
        priceChanges: pc30d || EMPTY_PRICE_CHANGES,
      },
    },
    byDistrict: groupBy(listings, "district").slice(0, 20),
    byRooms: groupBy(listings, "rooms_count"),
    byRenovation: groupBy(listings, "renovation"),
    byBuildingType: groupBy(listings, "building_type"),
    recentListings: recentRes.data || [],
  };

  if (!bypassCache) {
    cache = { data: result, ts: Date.now() };
  }
  return NextResponse.json(result);
}

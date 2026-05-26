import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE = 1000;
const DEFAULT_JOURNEY_LIMIT = 50;
const MAX_JOURNEY_LIMIT = 100;

async function fetchAllRows(buildQuery) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
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

function normalizePagination({ journeyLimit, journeyOffset } = {}) {
  const parsedLimit = Number(journeyLimit);
  const parsedOffset = Number(journeyOffset);

  return {
    limit: Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.trunc(parsedLimit), 1), MAX_JOURNEY_LIMIT)
      : DEFAULT_JOURNEY_LIMIT,
    offset: Number.isFinite(parsedOffset) ? Math.max(Math.trunc(parsedOffset), 0) : 0,
  };
}

export async function fetchZdgAdStats(options = {}) {
  const { limit, offset } = normalizePagination(options);

  let events;
  try {
    events = await fetchAllRows(() =>
      supabaseAdmin
        .from("ad_source_events")
        .select("event_name, user_id, device_id, session_id, path, referrer, metadata, created_at")
        .eq("source", "zdg")
        .order("created_at", { ascending: false })
    );
  } catch (error) {
    if (error.code === "42P01") {
      return { available: false, error: "ad_source_events table is missing.", events: [] };
    }
    console.error("Failed to load ZDG ad events:", error.message);
    return { available: false, error: "Failed to load ZDG ad events.", events: [] };
  }

  const usersById = await fetchUsersById(events.map((event) => event.user_id));
  const uniqueSessions = new Set(events.map((event) => event.session_id).filter(Boolean));
  const uniqueDevices = new Set(events.map((event) => event.device_id).filter(Boolean));
  const identifiedUsers = new Set(events.map((event) => event.user_id).filter(Boolean));
  const countsByEvent = events.reduce((acc, event) => {
    acc[event.event_name] = (acc[event.event_name] || 0) + 1;
    return acc;
  }, {});
  const allJourneys = groupAdJourneys(events, usersById);
  const journeys = allJourneys.slice(offset, offset + limit);

  return {
    available: true,
    source: "zdg",
    totalEvents: events.length,
    uniqueSessions: uniqueSessions.size,
    uniqueDevices: uniqueDevices.size,
    identifiedUsers: identifiedUsers.size,
    countsByEvent,
    recentEvents: events.slice(0, limit),
    journeys,
    journeyLimit: limit,
    journeyOffset: offset,
    totalJourneys: allJourneys.length,
    hasMoreJourneys: offset + journeys.length < allJourneys.length,
  };
}

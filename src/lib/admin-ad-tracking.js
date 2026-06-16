import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE = 1000;
const DEFAULT_JOURNEY_LIMIT = 50;
const MAX_JOURNEY_LIMIT = 100;
const LANDING_EVENT_NAMES = new Set(["source_landing_visit"]);
const PAID_PAYMENT_STATUSES = new Set(["paid"]);

export const AD_TRACKING_SOURCES = {
  zdg: {
    label: "ZDG",
    entryPath: "/?src=zdg",
  },
  reddit: {
    label: "Reddit",
    entryPath: "/?utm_source=reddit",
  },
};

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

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function buildFirstSourceSeenByUser(events) {
  const firstSeenByUser = new Map();

  for (const event of events) {
    if (!event.user_id) continue;
    const eventTime = parseTime(event.created_at);
    if (eventTime == null) continue;

    const currentTime = firstSeenByUser.get(event.user_id);
    if (currentTime == null || eventTime < currentTime) {
      firstSeenByUser.set(event.user_id, eventTime);
    }
  }

  return firstSeenByUser;
}

async function fetchPaidOrdersForUsers(userIds, since) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const rows = [];
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const chunk = uniqueIds.slice(i, i + 200);
    let query = supabaseAdmin
      .from("paddle_payment_orders")
      .select("id, user_id, product_key, status, paid_at, created_at, amount_minor, currency_code")
      .in("user_id", chunk)
      .in("status", Array.from(PAID_PAYMENT_STATUSES));

    if (since) query = query.gte("created_at", since);

    const { data, error } = await query
      .order("paid_at", { ascending: false });

    if (error) throw error;
    rows.push(...(data || []));
  }

  return rows;
}

async function fetchAdPurchases(events, since) {
  const firstSeenByUser = buildFirstSourceSeenByUser(events);
  const userIds = Array.from(firstSeenByUser.keys());

  let orders;
  try {
    orders = await fetchPaidOrdersForUsers(userIds, since);
  } catch (error) {
    if (error.code === "42P01") {
      return { available: false, users: new Map(), purchasedUsers: 0, paidOrders: 0 };
    }
    throw error;
  }

  const purchasesByUser = new Map();
  for (const order of orders) {
    const userId = order.user_id;
    const firstSeenTime = firstSeenByUser.get(userId);
    const paidTime = parseTime(order.paid_at || order.created_at);
    if (!userId || firstSeenTime == null || paidTime == null || paidTime < firstSeenTime) continue;

    if (!purchasesByUser.has(userId)) purchasesByUser.set(userId, []);
    purchasesByUser.get(userId).push({
      id: order.id,
      productKey: order.product_key,
      paidAt: order.paid_at || order.created_at,
      amountMinor: order.amount_minor,
      currencyCode: order.currency_code,
    });
  }

  for (const purchases of purchasesByUser.values()) {
    purchases.sort((a, b) => (parseTime(b.paidAt) || 0) - (parseTime(a.paidAt) || 0));
  }

  return {
    available: true,
    users: purchasesByUser,
    purchasedUsers: purchasesByUser.size,
    paidOrders: Array.from(purchasesByUser.values()).reduce((sum, rows) => sum + rows.length, 0),
  };
}

function groupAdJourneys(events, usersById, purchasesByUser = new Map()) {
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
    .map((group) => {
      const purchases = group.userId ? purchasesByUser.get(group.userId) || [] : [];
      return {
        ...group,
        purchased: purchases.length > 0,
        purchases,
        purchaseCount: purchases.length,
        events: group.events.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
      };
    })
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

function buildAdEventsQuery(source, since) {
  let query = supabaseAdmin
    .from("ad_source_events")
    .select("event_name, user_id, device_id, session_id, path, referrer, metadata, created_at")
    .eq("source", source);

  if (since) query = query.gte("created_at", since);

  return query.order("created_at", { ascending: false });
}

export async function fetchAdSourceStats({ source = "zdg", ...options } = {}) {
  const sourceConfig = AD_TRACKING_SOURCES[source];
  if (!sourceConfig) {
    return { available: false, error: "Unknown ad source.", events: [] };
  }

  const { limit, offset } = normalizePagination(options);
  const since = options.since || null;

  let events;
  try {
    events = await fetchAllRows(() => buildAdEventsQuery(source, since));
  } catch (error) {
    if (error.code === "42P01") {
      return { available: false, error: "ad_source_events table is missing.", events: [] };
    }
    console.error(`Failed to load ${sourceConfig.label} ad events:`, error.message);
    return { available: false, error: `Failed to load ${sourceConfig.label} ad events.`, events: [] };
  }

  const usersById = await fetchUsersById(events.map((event) => event.user_id));
  let purchaseStats = { available: true, users: new Map(), purchasedUsers: 0, paidOrders: 0 };
  try {
    purchaseStats = await fetchAdPurchases(events, since);
  } catch (error) {
    console.error(`Failed to load ${sourceConfig.label} ad purchases:`, error.message);
    purchaseStats = { available: false, users: new Map(), purchasedUsers: 0, paidOrders: 0 };
  }
  const uniqueSessions = new Set(events.map((event) => event.session_id).filter(Boolean));
  const uniqueDevices = new Set(events.map((event) => event.device_id).filter(Boolean));
  const identifiedUsers = new Set(events.map((event) => event.user_id).filter(Boolean));
  const countsByEvent = events.reduce((acc, event) => {
    acc[event.event_name] = (acc[event.event_name] || 0) + 1;
    return acc;
  }, {});
  const journeyEvents = events.filter((event) => {
    if (event.event_name !== "page_view") return true;
    return !events.some((candidate) =>
      LANDING_EVENT_NAMES.has(candidate.event_name) &&
      candidate.session_id === event.session_id &&
      candidate.path === event.path
    );
  });
  const allJourneys = groupAdJourneys(journeyEvents, usersById, purchaseStats.users);
  const journeys = allJourneys.slice(offset, offset + limit);

  return {
    available: true,
    source,
    sourceLabel: sourceConfig.label,
    entryPath: sourceConfig.entryPath,
    totalEvents: events.length,
    uniqueSessions: uniqueSessions.size,
    uniqueDevices: uniqueDevices.size,
    identifiedUsers: identifiedUsers.size,
    purchasedUsers: purchaseStats.purchasedUsers,
    paidOrders: purchaseStats.paidOrders,
    purchaseTrackingAvailable: purchaseStats.available,
    countsByEvent,
    recentEvents: events.slice(0, limit),
    journeys,
    journeyLimit: limit,
    journeyOffset: offset,
    totalJourneys: allJourneys.length,
    hasMoreJourneys: offset + journeys.length < allJourneys.length,
  };
}

export async function fetchAdPurchaseSummary() {
  let events;
  try {
    events = await fetchAllRows(() =>
      supabaseAdmin
        .from("ad_source_events")
        .select("source, user_id, created_at")
        .in("source", Object.keys(AD_TRACKING_SOURCES))
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
    );
  } catch (error) {
    if (error.code === "42P01") {
      return { available: false, totalPurchasedUsers: 0, paidOrders: 0, bySource: {} };
    }
    throw error;
  }

  const purchasedUserIds = new Set();
  const bySource = {};
  let paidOrders = 0;

  for (const source of Object.keys(AD_TRACKING_SOURCES)) {
    const sourceEvents = events.filter((event) => event.source === source);
    const sourcePurchases = await fetchAdPurchases(sourceEvents);

    bySource[source] = {
      purchasedUsers: sourcePurchases.purchasedUsers,
      paidOrders: sourcePurchases.paidOrders,
      available: sourcePurchases.available,
    };
    paidOrders += sourcePurchases.paidOrders;

    for (const userId of sourcePurchases.users.keys()) {
      purchasedUserIds.add(userId);
    }
  }

  return {
    available: Object.values(bySource).every((item) => item.available),
    totalPurchasedUsers: purchasedUserIds.size,
    paidOrders,
    bySource,
  };
}

export async function fetchZdgAdStats(options = {}) {
  return fetchAdSourceStats({ source: "zdg", ...options });
}

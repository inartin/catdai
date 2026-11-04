import { supabaseAdmin } from "@/lib/supabase-admin";
import { AD_TRACKING_SOURCES } from "@/lib/ad-sources";
import { fetchVisitorHistory } from "@/lib/admin-visitor-history";
import { normalizeVisitorId } from "@/lib/visitor";

export { AD_TRACKING_SOURCES };

const PAGE = 1000;
const DEFAULT_JOURNEY_LIMIT = 50;
const MAX_JOURNEY_LIMIT = 100;
const LANDING_EVENT_NAMES = new Set(["source_landing_visit"]);
const PAID_PAYMENT_STATUSES = new Set(["paid", "partially_refunded"]);

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
      throw error;
    }

    const chunk = data?.users || [];
    for (const user of chunk) {
      if (uniqueIds.includes(user.id)) {
        users.set(user.id, {
          id: user.id,
          name: user.is_anonymous ? "Guest" : userDisplayName(user),
          email: user.email || null,
          isGuest: Boolean(user.is_anonymous),
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

  // Sign-in attaches an account to this session's earlier anonymous entry.
  for (const journey of groupAdJourneys(events, new Map())) {
    if (!journey.userId) continue;
    const eventTime = parseTime(journey.firstSeenAt);
    if (eventTime == null) continue;

    const currentTime = firstSeenByUser.get(journey.userId);
    if (currentTime == null || eventTime < currentTime) {
      firstSeenByUser.set(journey.userId, eventTime);
    }
  }

  return firstSeenByUser;
}

async function fetchPaidOrdersForUsers(userIds) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const rows = [];
  for (let i = 0; i < uniqueIds.length; i += 200) {
    const chunk = uniqueIds.slice(i, i + 200);
    const orders = await fetchAllRows(() => supabaseAdmin
      .from("reporting_payment_orders")
      .select("id, provider, user_id, product_key, status, paid_at, created_at, amount_minor, currency_code")
      .in("user_id", chunk)
      .in("status", Array.from(PAID_PAYMENT_STATUSES))
      .order("paid_at", { ascending: false }).order("id").order("provider"));
    rows.push(...orders);
  }

  return rows;
}

async function fetchAdPurchases(events) {
  const firstSeenByUser = buildFirstSourceSeenByUser(events);
  const userIds = Array.from(firstSeenByUser.keys());

  let orders;
  try {
    orders = await fetchPaidOrdersForUsers(userIds);
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
      provider: order.provider,
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
        visitor: event.visitor || null,
        userId: null,
        user: null,
        userIds: new Set(),
        firstSeenAt: event.created_at,
        lastSeenAt: event.created_at,
        eventCount: 0,
        events: [],
      });
    }

    const group = groups.get(key);
    group.eventCount += 1;
    group.events.push(event);

    if (event.user_id) group.userIds.add(event.user_id);

    if (Date.parse(event.created_at) < Date.parse(group.firstSeenAt)) {
      group.firstSeenAt = event.created_at;
    }
    if (Date.parse(event.created_at) > Date.parse(group.lastSeenAt)) {
      group.lastSeenAt = event.created_at;
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const { userIds, ...journey } = group;
      const userId = userIds.size === 1 ? [...userIds][0] : null;
      const user = userId ? usersById.get(userId) || { id: userId, name: userId, email: null } : null;
      const purchases = (userId ? purchasesByUser.get(userId) || [] : [])
        .filter((purchase) => parseTime(purchase.paidAt) >= parseTime(group.firstSeenAt));
      return {
        ...journey,
        userId,
        user,
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
    .select("event_name, user_id, visitor, device_id, session_id, path, referrer, metadata, created_at")
    .eq("source", source);

  if (since) query = query.gte("created_at", since);

  return query.order("created_at", { ascending: false }).order("id", { ascending: false });
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

  let usersById;
  try {
    usersById = await fetchUsersById(events.map((event) => event.user_id));
  } catch {
    return { available: false, error: "Failed to load tracked user identities.", events: [] };
  }
  let purchaseStats = { available: true, users: new Map(), purchasedUsers: 0, paidOrders: 0 };
  try {
    purchaseStats = await fetchAdPurchases(events);
  } catch (error) {
    console.error(`Failed to load ${sourceConfig.label} ad purchases:`, error.message);
    purchaseStats = { available: false, users: new Map(), purchasedUsers: 0, paidOrders: 0 };
  }
  const uniqueSessions = new Set(events.map((event) => event.session_id).filter(Boolean));
  const uniqueDevices = new Set(events.map((event) => event.device_id).filter(Boolean));
  const identifiedUsers = new Set(events.map((event) => event.user_id)
    .filter((id) => id && usersById.get(id) && !usersById.get(id).isGuest));
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

export async function fetchAdJourneyActivity({ source, sessionId, deviceId, since }) {
  const entries = await fetchAllRows(() => {
    let query = supabaseAdmin.from("ad_source_events")
      .select("user_id, device_id, visitor, created_at").eq("source", source);
    query = sessionId ? query.eq("session_id", sessionId) : query.eq("device_id", deviceId);
    if (since) query = query.gte("created_at", since);
    return query.order("created_at", { ascending: true }).order("id");
  });
  if (!entries.length) return [];
  const devices = [...new Set(entries.map((event) => normalizeVisitorId(event.visitor?.device_id)
    || normalizeVisitorId(event.device_id)).filter(Boolean))];
  const userIds = [...new Set(entries.map((event) => event.user_id).filter(Boolean))];
  // Several accounts in one tab cannot establish a single attributed account.
  return fetchVisitorHistory({
    deviceId: devices.length === 1 ? devices[0] : null,
    userIds: userIds.length === 1 ? userIds : [],
    since: entries[0].created_at,
    includeAdEvents: false,
  });
}

export async function fetchAdPurchaseSummary() {
  let events;
  try {
    events = await fetchAllRows(() =>
      supabaseAdmin
        .from("ad_source_events")
        .select("source, user_id, session_id, device_id, created_at")
        .in("source", Object.keys(AD_TRACKING_SOURCES))
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

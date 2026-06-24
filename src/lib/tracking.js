const DEVICE_KEY = "catdai-device-id";
const SESSION_KEY = "catdai-session-id";
const AD_SOURCE_KEY = "catdai-ad-source";
const TRACKED_AD_SOURCES = new Set(["zdg", "reddit", "vtememd"]);

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function captureAdSource(source, details = {}) {
  if (!TRACKED_AD_SOURCES.has(source)) return null;

  try {
    const payload = {
      source,
      captured_at: new Date().toISOString(),
      ...details,
    };
    sessionStorage.setItem(AD_SOURCE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function getActiveAdSource() {
  try {
    const raw = sessionStorage.getItem(AD_SOURCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!TRACKED_AD_SOURCES.has(parsed?.source)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function trackAdSourceEvent(eventName, metadata = {}) {
  const attribution = getActiveAdSource();
  if (!attribution || typeof window === "undefined") return;

  const { accessToken, ...eventMetadata } = metadata || {};
  const body = JSON.stringify({
    source: attribution.source,
    event_name: eventName,
    device_id: getDeviceId(),
    session_id: getSessionId(),
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
    metadata: {
      captured_at: attribution.captured_at,
      landing_path: attribution.landing_path || null,
      ...eventMetadata,
    },
  });

  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    if (!accessToken && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/ad-source-events", blob);
      return;
    }
  } catch {}

  try {
    fetch("/api/ad-source-events", {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function trackPaymentCheckoutEvent(eventType, metadata = {}) {
  if (typeof window === "undefined") return;

  const { accessToken, ...eventMetadata } = metadata || {};
  const body = JSON.stringify({
    event_type: eventType,
    device_id: getDeviceId(),
    session_id: getSessionId(),
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
    ...eventMetadata,
  });

  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  try {
    fetch("/api/payment-checkout-events", {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function computeEvaluationGroupId({ city, district, rooms_count, building_type, estimate_type }) {
  const raw = [city, district, rooms_count, building_type, estimate_type]
    .map((v) => String(v ?? ""))
    .join("|");
  return djb2(raw);
}

const LOG_ID_PREFIX = "catdai-log-";

export function getOrCreateLogId(evaluationGroupId) {
  try {
    const key = LOG_ID_PREFIX + evaluationGroupId;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

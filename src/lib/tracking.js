import { fetchWithStatisticsAuth } from "@/lib/statistics-client";
import { AD_TRACKING_SOURCES, getAdSourceFromParams } from "@/lib/ad-sources";

import { getDeviceId } from "@/lib/visitor-browser";
export { getDeviceId };
const SESSION_KEY = "catdai-session-id";
const AD_SOURCE_KEY = "catdai-ad-source";
const AD_SOURCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const TRACKED_AD_SOURCES = new Set(Object.keys(AD_TRACKING_SOURCES));

function readAdSource(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(AD_SOURCE_KEY) || "null");
    const age = Date.now() - Date.parse(parsed?.captured_at);
    return TRACKED_AD_SOURCES.has(parsed?.source) && age >= 0 && age < AD_SOURCE_MAX_AGE_MS ? parsed : null;
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
    const existing = readAdSource(sessionStorage);
    if (existing?.source === source && existing.landing_path === details.landing_path) return existing;
    const payload = {
      source,
      captured_at: new Date().toISOString(),
      ...details,
    };
    const raw = JSON.stringify(payload);
    let stored = false;
    try { sessionStorage.setItem(AD_SOURCE_KEY, raw); stored = true; } catch { /* Try persistent storage too. */ }
    try { localStorage.setItem(AD_SOURCE_KEY, raw); stored = true; } catch { /* Session tracking still works. */ }
    return stored ? payload : null;
  } catch {
    return null;
  }
}

export function getActiveAdSource() {
  try {
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development"
      && /^\/(?:ro\/|ru\/|en\/)?cadastru(?:\/|$)/.test(window.location.pathname)) return null;
    // Auth and feature effects can run before the global page tracker mounts.
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin")) {
      const source = getAdSourceFromParams(new URLSearchParams(window.location.search));
      if (source) return captureAdSource(source, {
        landing_path: window.location.pathname + window.location.search,
        referrer: document.referrer || null,
      });
    }
    return readAdSource(sessionStorage) || readAdSource(localStorage);
  } catch {
    return null;
  }
}

export function trackAdSourceEvent(eventName, metadata = {}) {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) return;
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development"
    && /^\/(?:ro\/|ru\/|en\/)?cadastru(?:\/|$)/.test(window.location.pathname)) return;
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
    fetchWithStatisticsAuth("/api/ad-source-events", {
      method: "POST",
      headers,
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function trackPaymentCheckoutEvent(eventType, metadata = {}) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development"
    && /^\/(?:ro\/|ru\/|en\/)?cadastru(?:\/|$)/.test(window.location.pathname)) return;

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
    fetchWithStatisticsAuth("/api/payment-checkout-events", {
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

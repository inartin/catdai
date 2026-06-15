"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const JOURNEY_PAGE_SIZE = 50;
const AD_SOURCES = [
  { key: "zdg", label: "ZDG", entryPath: "/?src=zdg" },
  { key: "reddit", label: "Reddit", entryPath: "/?utm_source=reddit" },
];

function fmtNum(n) {
  if (n == null) return "\u2014";
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

function fmtDateTime(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

const AD_EVENT_LABELS = {
  page_view: "Viewed a page",
  landing_estimate_cta: "Clicked estimate button",
  estimate_form_view: "Opened estimate form",
  estimate_submit: "Submitted estimate form",
  estimate_result_view: "Viewed estimate result",
  signed_in: "Signed in",
};

const PAYMENT_PRODUCT_LABELS = {
  standard_pack: "Standard package",
  pro_pack: "Pro package",
  extra_pack: "Extra package",
  sale_estimate_single: "Sale estimate",
  rent_estimate_single: "Rent estimate",
  listing_analysis_single: "Listing analysis",
  cadastru_lookup_single: "Cadastru lookup",
  yield_calculator_single: "Yield calculator",
  pdf_report_single: "PDF report",
};

function fmtAdEventName(eventName, sourceConfig) {
  if (eventName === "source_landing_visit") return `Opened landing page from ${sourceConfig.label}`;
  return AD_EVENT_LABELS[eventName] || eventName || "\u2014";
}

function fmtAdEventDetail(event, sourceConfig) {
  const meta = event?.metadata || {};
  if (event.event_name === "estimate_result_view") {
    return [
      meta.rooms_count ? `${meta.rooms_count} rooms` : null,
      meta.district,
      meta.city,
    ].filter(Boolean).join(" · ") || "\u2014";
  }
  if (event.event_name === "estimate_submit") return "Estimate form submitted";
  if (event.event_name === "landing_estimate_cta") return "Moved from landing page to estimate form";
  if (event.event_name === "source_landing_visit") return `First visit with ${sourceConfig.entryPath}`;
  if (event.event_name === "signed_in") return "User account attached to this visit";
  return event.path || "\u2014";
}

function fmtUser(journey) {
  if (!journey?.user) return "Anonymous visitor";
  return journey.user.email || journey.user.name || journey.user.id;
}

function fmtJourneySummary(journey) {
  const actions = new Set((journey.events || []).map((event) => event.event_name));
  const parts = [];
  if (actions.has("source_landing_visit")) parts.push("opened landing");
  if (actions.has("landing_estimate_cta")) parts.push("clicked estimate");
  if (actions.has("estimate_submit")) parts.push("submitted estimate");
  if (actions.has("estimate_result_view")) parts.push("saw result");
  if (actions.has("signed_in")) parts.push("signed in");
  if (journey.purchased) parts.push("bought");
  return parts.length > 0 ? parts.join(" · ") : `${fmtNum(journey.eventCount)} events`;
}

function fmtPurchaseSummary(journey) {
  const purchases = Array.isArray(journey?.purchases) ? journey.purchases : [];
  if (purchases.length === 0) return null;

  const latest = purchases[0];
  const productLabel = PAYMENT_PRODUCT_LABELS[latest.productKey] || latest.productKey || "Payment";
  const suffix = purchases.length > 1 ? ` + ${fmtNum(purchases.length - 1)} more` : "";
  return `${productLabel}${suffix} · ${fmtDateTime(latest.paidAt)}`;
}

function eventGroupKey(event, sourceConfig) {
  return [
    event.event_name || "",
    event.path || "",
    fmtAdEventDetail(event, sourceConfig),
  ].join("|");
}

function groupJourneyEvents(events = [], sourceConfig) {
  const groups = new Map();

  for (const event of events) {
    const key = eventGroupKey(event, sourceConfig);
    if (!groups.has(key)) {
      groups.set(key, {
        ...event,
        count: 0,
        firstAt: event.created_at,
        lastAt: event.created_at,
      });
    }

    const group = groups.get(key);
    group.count += 1;
    if (Date.parse(event.created_at) < Date.parse(group.firstAt)) group.firstAt = event.created_at;
    if (Date.parse(event.created_at) > Date.parse(group.lastAt)) group.lastAt = event.created_at;
  }

  return Array.from(groups.values()).sort((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt));
}

export default function AdTrackingPage() {
  const [selectedSource, setSelectedSource] = useState("zdg");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [openJourneys, setOpenJourneys] = useState({});
  const loadMoreRef = useRef(null);
  const sourceConfig = AD_SOURCES.find((source) => source.key === selectedSource) || AD_SOURCES[0];

  const loadAdTracking = useCallback((offset = 0, { fresh = false } = {}) => {
    if (offset === 0) {
      if (fresh) setRefreshing(true);
      else setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    const params = new URLSearchParams({
      source: selectedSource,
      limit: String(JOURNEY_PAGE_SIZE),
      offset: String(offset),
    });
    if (fresh) params.set("fresh", "1");

    fetch(`/api/admin/ad-tracking?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const nextAd = data.ad || {};
        setStats((current) => {
          if (offset === 0) return { ad: nextAd };

          const currentJourneys = current?.ad?.journeys || [];
          const nextJourneys = nextAd.journeys || [];
          const currentKeys = new Set(currentJourneys.map((journey) => journey.key));

          return {
            ad: {
              ...nextAd,
              journeys: [
                ...currentJourneys,
                ...nextJourneys.filter((journey) => !currentKeys.has(journey.key)),
              ],
            },
          };
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load ad tracking");
        setLoading(false);
      })
      .finally(() => {
        setLoadingMore(false);
        setRefreshing(false);
      });
  }, [selectedSource]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadAdTracking(0), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdTracking]);

  const ad = stats?.ad || {};
  const loadedJourneyCount = Array.isArray(ad.journeys) ? ad.journeys.length : 0;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || loading || loadingMore || !ad.hasMoreJourneys) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadAdTracking(loadedJourneyCount);
      }
    }, { rootMargin: "240px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [ad.hasMoreJourneys, loadAdTracking, loadedJourneyCount, loading, loadingMore]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading ad tracking...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <p className="text-red-500 font-medium">Failed to load ad tracking</p>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  const adCounts = ad.countsByEvent || {};

  const toggleJourney = (key) => {
    setOpenJourneys((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            {sourceConfig.label} visitors who entered through{" "}
            <span className="font-medium text-gray-700">{sourceConfig.entryPath}</span>.
          </p>
          <div className="mt-4 inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            {AD_SOURCES.map((source) => {
              const isActive = source.key === selectedSource;
              return (
                <button
                  key={source.key}
                  type="button"
                  onClick={() => {
                    setOpenJourneys({});
                    setSelectedSource(source.key);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isActive
                    ? "bg-primary text-white"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    } cursor-pointer`}
                >
                  {source.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpenJourneys({});
            loadAdTracking(0, { fresh: true });
          }}
          disabled={refreshing || loading || loadingMore}
          className="self-start px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:border-primary/40 hover:text-primary disabled:text-gray-400 disabled:hover:border-gray-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {refreshing ? "Refreshing..." : "Hard refresh"}
        </button>
      </div>

      {!ad.available ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {ad.error || "Ad tracking data is not available yet."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-4">
            <StatCard label="Tracked Sessions" value={fmtNum(ad.uniqueSessions)} />
            <StatCard label="Tracked Devices" value={fmtNum(ad.uniqueDevices)} />
            <StatCard label="Registered Users" value={fmtNum(ad.identifiedUsers || 0)} />
            <StatCard label="Paid Users" value={fmtNum(ad.purchasedUsers || 0)} />
            <StatCard label="Landing Visits" value={fmtNum(adCounts.source_landing_visit || 0)} />
            <StatCard label="Estimate Button Clicks" value={fmtNum(adCounts.landing_estimate_cta || 0)} />
            <StatCard label="Estimate Submits" value={fmtNum(adCounts.estimate_submit || 0)} />
          </div>

          {ad.purchaseTrackingAvailable === false && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
              Payment attribution is unavailable because Paddle order data could not be loaded.
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Visitors from {sourceConfig.label}</h2>
            </div>

            {!Array.isArray(ad.journeys) || ad.journeys.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No {sourceConfig.label} activity found</div>
            ) : (
              <div>
                <div className="divide-y divide-gray-100">
                  {ad.journeys.map((journey) => (
                    <div key={journey.key} className="p-5">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-gray-900">{fmtUser(journey)}</h3>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${journey.userId
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {journey.userId ? "Registered" : "Anonymous"}
                            </span>
                            {journey.purchased && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                Bought
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{fmtJourneySummary(journey)}</p>
                          {fmtPurchaseSummary(journey) && (
                            <p className="mt-1 text-xs font-medium text-primary">
                              {fmtPurchaseSummary(journey)}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-400">
                            First seen {fmtDateTime(journey.firstSeenAt)} · Last seen {fmtDateTime(journey.lastSeenAt)}
                          </p>
                        </div>
                        <div className="text-xs text-gray-400 lg:text-right">
                          <div className="font-mono">{journey.sessionId || "\u2014"}</div>
                          {journey.userId && <div className="mt-1 font-mono">{journey.userId}</div>}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleJourney(journey.key)}
                        className="mt-4 inline-flex cursor-pointer items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {openJourneys[journey.key] ? "Hide actions" : `Show actions (${fmtNum(journey.eventCount)})`}
                      </button>

                      {openJourneys[journey.key] && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                              <th className="py-2 pr-4">Action</th>
                              <th className="py-2 pr-4 text-right">Count</th>
                              <th className="py-2 pr-4">Details</th>
                              <th className="py-2 pr-4">Page</th>
                              <th className="py-2 pr-4">Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {groupJourneyEvents(journey.events || [], sourceConfig).map((event, index) => (
                              <tr key={`${event.event_name}-${event.firstAt}-${index}`} className="align-top">
                                <td className="py-2 pr-4 font-medium text-gray-900 min-w-56">
                                  {fmtAdEventName(event.event_name, sourceConfig)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-700 tabular-nums">
                                  {fmtNum(event.count)}
                                </td>
                                <td className="py-2 pr-4 text-gray-600 min-w-56">
                                  {fmtAdEventDetail(event, sourceConfig)}
                                </td>
                                <td className="py-2 pr-4 text-gray-600 min-w-64">
                                  {event.path || "\u2014"}
                                </td>
                                <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                                  {event.count > 1
                                    ? `${fmtDateTime(event.firstAt)} - ${fmtDateTime(event.lastAt)}`
                                    : fmtDateTime(event.firstAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      )}
                    </div>
                  ))}
                </div>
                <div ref={loadMoreRef} className="px-5 py-4 text-center text-sm text-gray-400">
                  {loadingMore
                    ? "Loading more..."
                    : ad.hasMoreJourneys
                      ? `Showing ${fmtNum(loadedJourneyCount)} of ${fmtNum(ad.totalJourneys)} visitors`
                      : `Showing all ${fmtNum(ad.totalJourneys)} visitors`}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

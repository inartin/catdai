"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const JOURNEY_PAGE_SIZE = 50;

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
  source_landing_visit: "Opened landing page from ZDG",
  page_view: "Viewed a page",
  landing_estimate_cta: "Clicked estimate button",
  estimate_form_view: "Opened estimate form",
  estimate_submit: "Submitted estimate form",
  estimate_result_view: "Viewed estimate result",
  signed_in: "Signed in",
};

function fmtAdEventName(eventName) {
  return AD_EVENT_LABELS[eventName] || eventName || "\u2014";
}

function fmtAdEventDetail(event) {
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
  if (event.event_name === "source_landing_visit") return "First visit with ?src=zdg";
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
  return parts.length > 0 ? parts.join(" · ") : `${fmtNum(journey.eventCount)} events`;
}

function eventGroupKey(event) {
  return [
    event.event_name || "",
    event.path || "",
    fmtAdEventDetail(event),
  ].join("|");
}

function groupJourneyEvents(events = []) {
  const groups = new Map();

  for (const event of events) {
    const key = eventGroupKey(event);
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
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [openJourneys, setOpenJourneys] = useState({});
  const loadMoreRef = useRef(null);

  const loadAdTracking = useCallback((offset = 0) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    fetch(`/api/admin/ad-tracking?limit=${JOURNEY_PAGE_SIZE}&offset=${offset}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const nextZdgAd = data.zdgAd || {};
        setStats((current) => {
          if (offset === 0) return { zdgAd: nextZdgAd };

          const currentJourneys = current?.zdgAd?.journeys || [];
          const nextJourneys = nextZdgAd.journeys || [];
          const currentKeys = new Set(currentJourneys.map((journey) => journey.key));

          return {
            zdgAd: {
              ...nextZdgAd,
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
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadAdTracking(0), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdTracking]);

  const zdgAd = stats?.zdgAd || {};
  const loadedJourneyCount = Array.isArray(zdgAd.journeys) ? zdgAd.journeys.length : 0;

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || loading || loadingMore || !zdgAd.hasMoreJourneys) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadAdTracking(loadedJourneyCount);
      }
    }, { rootMargin: "240px" });

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadAdTracking, loadedJourneyCount, loading, loadingMore, zdgAd.hasMoreJourneys]);

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

  const zdgCounts = zdgAd.countsByEvent || {};

  const toggleJourney = (key) => {
    setOpenJourneys((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ad tracking</h1>
        <p className="mt-1 text-sm text-gray-500">
          ZDG visitors who entered through <span className="font-medium text-gray-700">/?src=zdg</span>.
        </p>
      </div>

      {!zdgAd.available ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {zdgAd.error || "Ad tracking data is not available yet."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Tracked Sessions" value={fmtNum(zdgAd.uniqueSessions)} />
            <StatCard label="Tracked Devices" value={fmtNum(zdgAd.uniqueDevices)} />
            <StatCard label="Registered Users" value={fmtNum(zdgAd.identifiedUsers || 0)} />
            <StatCard label="Landing Visits" value={fmtNum(zdgCounts.source_landing_visit || 0)} />
            <StatCard label="Estimate Button Clicks" value={fmtNum(zdgCounts.landing_estimate_cta || 0)} />
            <StatCard label="Estimate Submits" value={fmtNum(zdgCounts.estimate_submit || 0)} />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Visitors from ZDG</h2>
            </div>

            {!Array.isArray(zdgAd.journeys) || zdgAd.journeys.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No ZDG activity found</div>
            ) : (
              <div>
                <div className="divide-y divide-gray-100">
                  {zdgAd.journeys.map((journey) => (
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
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{fmtJourneySummary(journey)}</p>
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
                        className="mt-4 inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-primary/40 hover:text-primary"
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
                            {groupJourneyEvents(journey.events || []).map((event, index) => (
                              <tr key={`${event.event_name}-${event.firstAt}-${index}`} className="align-top">
                                <td className="py-2 pr-4 font-medium text-gray-900 min-w-56">
                                  {fmtAdEventName(event.event_name)}
                                </td>
                                <td className="py-2 pr-4 text-right text-gray-700 tabular-nums">
                                  {fmtNum(event.count)}
                                </td>
                                <td className="py-2 pr-4 text-gray-600 min-w-56">
                                  {fmtAdEventDetail(event)}
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
                    : zdgAd.hasMoreJourneys
                      ? `Showing ${fmtNum(loadedJourneyCount)} of ${fmtNum(zdgAd.totalJourneys)} visitors`
                      : `Showing all ${fmtNum(zdgAd.totalJourneys)} visitors`}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

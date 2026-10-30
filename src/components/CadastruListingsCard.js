"use client";

import { useId, useRef, useState } from "react";
import { MarketTrendOverlayChart } from "@/components/MarketTrendMiniChart";
import { useTranslation } from "@/context/LanguageContext";

const latestPrice = (listing) => listing.price ?? listing.history.at(-1)?.[1] ?? null;
const unitPrice = (listing) => listing.pricePerM2 ?? (listing.area && latestPrice(listing) !== null ? Math.round(latestPrice(listing) / listing.area) : null);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? Math.round((sorted[middle] + sorted[Math.ceil(sorted.length / 2) - 1]) / 2) : null;
};

function BuildingIcon({ className }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M4 21V5l10-2v18M14 9h6v12M2 21h20M8 8h2M8 12h2M8 16h2M17 13h.01M17 17h.01" /></svg>;
}

function PriceHistory({ listing, money, date, label }) {
  const amounts = listing.history.map(([, amount]) => amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const padding = Math.max((high - low) * 0.5, high * 0.02);
  const firstTime = Date.parse(listing.history[0][0]);
  const lastTime = Date.parse(listing.history.at(-1)[0]);
  const points = listing.history.map(([day, amount]) => ({
    day, amount,
    x: listing.history.length === 1 ? 300 : 60 + (Date.parse(day) - firstTime) / (Math.max(1, lastTime - firstTime)) * 480,
    y: 105 - (amount - low + padding) / (high - low + padding * 2) * 70,
  }));
  return (
    <div className="mt-5 rounded-2xl bg-stone-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <h5 className="font-semibold text-gray-900">{label("history")}</h5>
        <span>{label("floor")} {listing.floor}</span>
      </div>
      <svg viewBox="0 0 600 150" className="mt-4 hidden w-full sm:block" role="img" aria-label={label("history")}>
        <line x1="60" x2="540" y1="112" y2="112" stroke="#d6d3d1" />
        <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} fill="none" stroke="#059669" strokeWidth="3" strokeLinejoin="round" />
        {points.map(({ day, amount, x, y }) => <g key={day}>
          <circle cx={x} cy={y} r="5" fill="#059669" stroke="white" strokeWidth="3" />
          <text x={x} y={y - 15} textAnchor="middle" fill="#1c1917" fontSize="15" fontWeight="600">{money(amount)}</text>
          <text x={x} y="140" textAnchor="middle" fill="#57534e" fontSize="14">{date(day)}</text>
        </g>)}
      </svg>
      <ol className="mt-5 space-y-4 sm:sr-only">
        {listing.history.map(([day, amount]) => <li key={day} className="flex justify-between gap-4 border-l-2 border-emerald-500 pl-3 text-base">
          <time dateTime={day} className="text-gray-600">{date(day)}</time><span className="font-semibold tabular-nums text-gray-900">{money(amount)}</span>
        </li>)}
      </ol>
    </div>
  );
}

function availableTrend(trend) {
  if (!trend) return null;
  const series = (trend.series || []).map((item) => ({ ...item,
    points: [...new Map((item.points || []).filter((point) => Number.isFinite(point.value) && point.value > 0 && Number.isFinite(Date.parse(point.date)))
      .map((point) => [point.date, point])).values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
  })).filter((item) => item.points.length >= 2);
  return series.length ? { ...trend, series } : null;
}

export default function CadastruListingsCard({ data = null, children }) {
  const { lang, t } = useTranslation();
  const [houseId, setHouseId] = useState("current");
  const [tab, setTab] = useState("active");
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);
  const contentId = useId();
  if (!data) return null;
  const label = (key) => t(`cadastru.market.${key}`);
  const number = new Intl.NumberFormat(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "ro-MD");
  const money = (value) => `${number.format(value)} €`;
  const date = (value) => new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "ro-MD", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`));
  const observationDate = (value) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "ro-MD", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Chisinau" }).format(new Date(value)) : null;
  const groups = (data.houses || []).map((house) => {
    const listings = (data.listings || []).filter((item) => item.house === house.id && item.active === (tab === "active"));
    const prices = listings.map(unitPrice).filter((value) => value !== null);
    return { ...house, listings, prices, median: median(prices) };
  });
  const visibleGroups = groups.filter((house) => house.listings.length > 0);
  const selected = visibleGroups.find((house) => house.id === houseId) || visibleGroups[0];
  const nearbyMedian = median(groups.filter((house) => house.id !== "current").flatMap((house) => house.prices));
  const currentMedian = groups.find((house) => house.id === "current")?.median;
  const difference = currentMedian && nearbyMedian ? Math.round((currentMedian / nearbyMedian - 1) * 100) : null;
  const allPrices = groups.flatMap((house) => house.prices);
  const comparisonMax = Math.max(1, ...allPrices);
  const currentListings = (data.listings || []).filter((listing) => listing.house === "current");
  const collectedCount = data.collectedCount ?? new Set(currentListings.map((listing) => listing.id)).size;
  const hasListings = (data.listings || []).length > 0;
  const trend = hasListings ? availableTrend(data.buildingTrend) || availableTrend(data.areaTrend) : availableTrend(data.areaTrend);
  if (!hasListings && !trend) return null;

  return (
    <section ref={cardRef} className="mx-1 mt-6 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm" aria-labelledby="cadastru-listings-title">
      <header className="relative bg-emerald-950 px-5 py-7 text-white sm:p-8">
        <BuildingIcon className="pointer-events-none absolute bottom-3 left-3 h-24 w-24 text-emerald-900/30" />
        <div className={`relative grid items-start gap-x-8 gap-y-7 ${trend ? "md:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)] md:grid-rows-[auto_1fr]" : ""}`}>
          <div className={`flex flex-wrap items-start justify-between gap-4 ${trend && collectedCount > 0 ? "md:col-span-2" : ""}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium tracking-wide text-emerald-200">{label("eyebrow")}</p>
              <h2 id="cadastru-listings-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {hasListings ? data.address : `${label("priceTrend")} · ${trend.name}`}
              </h2>
            </div>
            {collectedCount > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">{number.format(collectedCount)}</p>
                <p className="mt-1 text-base text-emerald-100">{label("collectedListings")}</p>
              </div>
            )}
          </div>

          {(currentMedian != null || nearbyMedian != null) && (
            <div className="flex flex-wrap items-end gap-x-10 gap-y-5 md:col-start-1 md:row-start-2">
              {currentMedian != null && (
                <div>
                  <p className="mb-2 text-base text-emerald-100">{tab === "active" ? label("currentMedian") : label("archiveMedian")}</p>
                  <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                    {currentMedian ? number.format(currentMedian) : "—"}
                    <span className="ml-2 text-xl font-normal text-emerald-200">€/m²</span>
                  </p>
                </div>
              )}
              {nearbyMedian != null && (
                <div className="pb-1 text-base leading-relaxed text-emerald-100">
                  <p>{label("sameStreetMedian")} <strong className="font-semibold text-white">{nearbyMedian ? money(nearbyMedian) : "—"} / m²</strong></p>
                  {difference !== null && (
                    <p className="mt-1">{difference === 0 ? label("similar") : t(`cadastru.market.${difference < 0 ? "below" : "above"}`, { percent: Math.abs(difference) })}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {trend && (
            <div className={`md:col-start-2 md:pl-6 ${collectedCount > 0 ? "md:row-start-2" : "md:row-span-2 md:row-start-1"}`}>
              <MarketTrendOverlayChart
                series={trend.series.map((series) => ({ ...series, label: label(series.key) }))}
                title={`${trend.scope === "building" ? label("building") : t("result.districtTrend")} · ${trend.name}`}
                metricLabel={t("result.trendMetricMedian")}
              />
            </div>
          )}
        </div>
        {children ? <div className="relative mt-6">{children}</div> : null}
        {hasListings && <button type="button" aria-expanded={expanded} aria-controls={contentId}
          onClick={() => {
            if (expanded && cardRef.current.getBoundingClientRect().top < 0) {
              const top = window.scrollY + cardRef.current.getBoundingClientRect().top - 88;
              window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
            }
            setExpanded(!expanded);
          }}
          className="relative mt-5 flex w-full cursor-pointer items-center justify-end gap-2 rounded-lg py-2 text-sm font-medium text-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300">
          {label("toggleDetails")}
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
        </button>}
      </header>

      <div id={contentId} hidden={!expanded || !hasListings} className="px-5 py-7 sm:p-8">
        {hasListings && <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-xl font-semibold tracking-tight text-gray-950">{label("medianComparison")}</h3>
          <div className="inline-flex rounded-xl bg-stone-100 p-1" role="group" aria-label={label("listingStatus")}>
            {["active", "archive"].map((item) => <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)} className={`cursor-pointer rounded-lg px-4 py-2.5 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${tab === item ? "bg-white text-emerald-900 shadow-sm" : "text-gray-600 hover:text-gray-950"}`}>{label(item)}</button>)}
          </div>
        </div>}

        {visibleGroups.length > 0 && <div className="mt-6 space-y-3" role="group" aria-label={label("medianComparison")}>
          {visibleGroups.map((house) => {
            const isSelected = selected.id === house.id;
            const minimum = house.prices.length ? Math.min(...house.prices) : null;
            const maximum = house.prices.length ? Math.max(...house.prices) : null;
            return (
              <button key={house.id} type="button" aria-pressed={isSelected} onClick={() => setHouseId(house.id)}
                aria-label={`${house.address}, ${house.listings.length} ${label("listings")}, ${house.median != null ? `${label("medianLabel")} ${money(house.median)} / m²` : label("noArea")}`}
                className={`block w-full cursor-pointer rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:p-5 ${isSelected ? "border-emerald-300 bg-emerald-50" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"}`}>
                <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <span>
                    <span className="block text-base font-semibold text-gray-950 sm:text-lg">{house.address}</span>
                    <span className="mt-1 block text-base text-gray-500">{house.listings.length} {label(house.listings.length === 1 ? "listingSingular" : "listings")}{house.distance ? ` · ${house.distance} m` : ""}</span>
                  </span>
                  <span className="block text-xl font-semibold tabular-nums tracking-tight text-gray-950 sm:text-2xl">{house.median != null ? money(house.median) : "—"}<span className="ml-1 text-base font-normal text-gray-500">/ m²</span></span>
                </span>
                {house.median != null && <span className="mt-4 block h-3 overflow-hidden rounded-full bg-stone-200/70" aria-hidden="true">
                  <span className={`block h-full rounded-full ${isSelected ? "bg-emerald-600" : "bg-stone-400"}`} style={{ width: `${house.median / comparisonMax * 100}%` }} />
                </span>}
                {minimum !== null && minimum !== maximum && <span className="mt-3 block text-base tabular-nums text-gray-600">{label("priceRange")} {number.format(minimum)}–{money(maximum)} / m²</span>}
              </button>
            );
          })}
        </div>}

        {selected && <div className="mt-8 border-t border-stone-200 pt-7" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xl font-semibold tracking-tight text-gray-950">{selected.address}</h3>
            <p className="text-base text-gray-500">{selected.listings.length} {label(tab === "active" ? "activeCount" : "archivedCount")}</p>
          </div>
          <div className="mt-2 divide-y divide-stone-100">
            {selected.listings.map((listing) => {
              const price = latestPrice(listing);
              const perM2 = unitPrice(listing);
              const observedFrom = observationDate(listing.firstSeenAt);
              const observedTo = observationDate(listing.lastSeenAt);
              const firstPrice = listing.history[0]?.[1];
              const change = firstPrice ? Math.round((price / firstPrice - 1) * 100) : 0;
              return (
                <details key={`${houseId}-${tab}-${listing.id}`} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden sm:gap-4">
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-gray-900 sm:text-lg">{listing.rooms ? `${listing.rooms} ${label("rooms")}` : label("apartment")}{listing.area ? ` · ${listing.area} m²` : ""}</span>
                      <span className="mt-1 block text-sm text-gray-500 sm:text-base">{listing.renovationLabel || label(listing.renovation || "unknown")}</span>
                      {!listing.active && (observedFrom || observedTo) && <span className="mt-1 block text-sm text-gray-500">
                        {label("observedDates")} {observedFrom ? <time dateTime={listing.firstSeenAt}>{observedFrom}</time> : <time dateTime={listing.lastSeenAt}>{observedTo}</time>}
                        {observedFrom && observedTo && observedTo !== observedFrom && <> – <time dateTime={listing.lastSeenAt}>{observedTo}</time></>}
                      </span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-semibold tabular-nums text-gray-950 sm:text-xl">{money(price)}</span>
                      <span className="mt-1 block text-sm tabular-nums text-gray-500 sm:text-base">{perM2 ? `${money(perM2)} / m²` : label("noArea")}</span>
                    </span>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0 text-stone-400 transition-transform group-open:rotate-180" aria-hidden="true"><path d="m5 8 5 5 5-5" /></svg>
                    <span className="sr-only">{label("history")}</span>
                  </summary>
                  {change !== 0 && <p className="mt-4 text-base font-medium text-emerald-700">{change > 0 ? "+" : ""}{change}% · {label("sinceFirst")}</p>}
                  {listing.history.length ? <PriceHistory listing={listing} money={money} date={date} label={label} /> : <p className="mt-4 rounded-xl bg-stone-50 p-4 text-base text-gray-500">{label("noRetainedHistory")}</p>}
                  {listing.sourceUrl && <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-base font-medium text-emerald-800 underline underline-offset-4">{label("sourceListing")} ↗</a>}
                </details>
              );
            })}
          </div>
        </div>}
      </div>
      <footer hidden={!expanded || !hasListings} className="border-t border-stone-100 px-5 py-4 text-sm text-gray-500 sm:px-8">
        {label("snapshotDate")} {new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "ro-MD", { dateStyle: "medium", timeZone: "Europe/Chisinau" }).format(new Date(data.capturedAt))}
      </footer>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

function fmtNum(n) {
  if (n == null) return "\u2014";
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

function fmtPrice(amount, currency) {
  if (amount == null) return "\u2014";
  return `${fmtNum(amount)} ${currency || "\u20AC"}`;
}

function fmtDate(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] wrap-break-word">
        {value || "\u2014"}
      </span>
    </div>
  );
}

function PriceChangeTag({ current, previous }) {
  if (previous == null || current == null) return null;
  const diff = Number(current) - Number(previous);
  if (diff === 0) return null;
  const pct = ((diff / Number(previous)) * 100).toFixed(1);
  const isUp = diff > 0;
  return (
    <span
      className={`inline-block ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
        isUp ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
      }`}
    >
      {isUp ? "+" : ""}
      {pct}%
    </span>
  );
}

function normalizeChartHistory(history) {
  return history
    .map((item) => {
      const price = Number(item.price_amount);
      const observedAt = item.observed_at || item.source_updated_at;
      const observedTime = observedAt ? Date.parse(observedAt) : NaN;

      if (!Number.isFinite(price) || !Number.isFinite(observedTime)) return null;

      return {
        id: item.id,
        price,
        date: observedAt,
        observedTime,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.observedTime - b.observedTime);
}

function PriceHistoryChart({ history, currency }) {
  const points = normalizeChartHistory(history);
  if (points.length <= 1) return null;

  const width = 760;
  const height = 240;
  const padding = { top: 22, right: 28, bottom: 46, left: 76 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = points.map((point) => point.price);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePadding =
    minValue === maxValue
      ? Math.max(Math.abs(maxValue) * 0.05, 100)
      : Math.max((maxValue - minValue) * 0.08, 1);
  const chartMin = Math.max(0, minValue - valuePadding);
  const chartMax = maxValue + valuePadding;
  const valueRange = chartMax - chartMin || 1;
  const bottomY = height - padding.bottom;

  const plotted = points.map((point, index) => {
    const x = padding.left + (index / (points.length - 1)) * chartWidth;
    const y = bottomY - ((point.price - chartMin) / valueRange) * chartHeight;
    return { ...point, x, y };
  });
  const linePoints = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPoints = `${padding.left},${bottomY} ${linePoints} ${width - padding.right},${bottomY}`;
  const gridValues = [chartMax, (chartMax + chartMin) / 2, chartMin];
  const firstPoint = plotted[0];
  const lastPoint = plotted[plotted.length - 1];

  return (
    <div className="border-b border-gray-100 px-5 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Price History Chart</h3>
          <p className="mt-1 text-xs text-gray-400">
            {fmtDate(firstPoint.date)} - {fmtDate(lastPoint.date)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Latest price</p>
          <p className="text-lg font-semibold text-gray-900">
            {fmtPrice(lastPoint.price, currency)}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Price history chart"
          className="min-w-[620px] w-full"
        >
          <defs>
            <linearGradient id="price-history-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridValues.map((value) => {
            const y = bottomY - ((value - chartMin) / valueRange) * chartHeight;
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                />
                <text
                  x={padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-400 text-[11px]"
                >
                  {fmtPrice(value, currency)}
                </text>
              </g>
            );
          })}
          <polygon points={areaPoints} fill="url(#price-history-fill)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="#16a34a"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {plotted.map((point, index) => (
            <g key={point.id || `${point.date}-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={index === plotted.length - 1 ? 5 : 4}
                fill={index === plotted.length - 1 ? "#15803d" : "#ffffff"}
                stroke="#16a34a"
                strokeWidth="2"
              />
              <title>
                {fmtDateTime(point.date)} - {fmtPrice(point.price, currency)}
              </title>
            </g>
          ))}
          <text
            x={firstPoint.x}
            y={height - 14}
            textAnchor="start"
            className="fill-gray-400 text-[11px]"
          >
            {fmtDate(firstPoint.date)}
          </text>
          <text
            x={lastPoint.x}
            y={height - 14}
            textAnchor="end"
            className="fill-gray-400 text-[11px]"
          >
            {fmtDate(lastPoint.date)}
          </text>
        </svg>
      </div>
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams();
  const [listing, setListing] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/listings/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setListing(data.listing || null);
        setPriceHistory(data.priceHistory || []);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Listing not found</p>
        <Link
          href="/admin/listings"
          className="text-primary hover:underline text-sm mt-2 inline-block"
        >
          Back to listings
        </Link>
      </div>
    );
  }

  const l = listing;
  const minPrice = priceHistory.length > 0
    ? Math.min(...priceHistory.map((h) => Number(h.price_amount)))
    : null;
  const maxPrice = priceHistory.length > 0
    ? Math.max(...priceHistory.map((h) => Number(h.price_amount)))
    : null;
  const priceChanged = minPrice !== maxPrice;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/listings"
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          &larr; Listings
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900 truncate max-w-2xl">
          {l.title}
        </h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Listing Info</h2>
          <InfoRow label="Price" value={fmtPrice(l.price_amount, l.price_currency)} />
          {l.old_price_amount && (
            <InfoRow label="Old Price" value={fmtPrice(l.old_price_amount, l.price_currency)} />
          )}
          <InfoRow label="Price/m\u00B2" value={fmtPrice(l.price_per_m2, l.price_currency)} />
          <InfoRow label="Area" value={l.area_m2 ? `${l.area_m2} m\u00B2` : null} />
          <InfoRow label="Rooms" value={l.rooms_count} />
          <InfoRow
            label="Floor"
            value={l.floor != null ? `${l.floor}/${l.total_floors || "?"}` : null}
          />
          <InfoRow label="Building" value={l.building_type} />
          <InfoRow label="Renovation" value={l.renovation} />
          <InfoRow label="Bathrooms" value={l.bathrooms_count} />
          <InfoRow label="Balconies" value={l.balconies_count} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Location</h2>
          <InfoRow label="City" value={l.city} />
          <InfoRow label="District" value={l.district} />
          <InfoRow label="Sector" value={l.sector} />
          <InfoRow label="Address" value={l.address_text} />

          <h2 className="font-semibold text-gray-900 mb-3 mt-6">Meta</h2>
          <InfoRow label="Source" value={l.source} />
          <InfoRow label="External ID" value={l.external_id} />
          <InfoRow
            label="Status"
            value={
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                  l.is_active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {l.is_active ? "Active" : "Inactive"}
              </span>
            }
          />
          <InfoRow label="First Seen" value={fmtDate(l.first_seen_at)} />
          <InfoRow label="Last Seen" value={fmtDate(l.last_seen_at)} />
          <InfoRow label="Created" value={fmtDate(l.created_at)} />
          {l.source_url && (
            <div className="mt-3">
              <a
                href={l.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                View on source &rarr;
              </a>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {l.owner && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Owner</h2>
              <p className="text-sm text-gray-700 font-medium">
                {l.owner.display_name || l.owner.login || "Unknown"}
              </p>
              <Link
                href={`/admin/owners/${l.owner.id}`}
                className="text-primary hover:underline text-xs mt-1 inline-block"
              >
                View owner profile &rarr;
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="text-xs font-medium text-gray-500 uppercase">
                Price Changes
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {priceHistory.length}
              </p>
            </div>
            {priceChanged && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <p className="text-xs font-medium text-gray-500 uppercase">
                    Price Range
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {fmtPrice(minPrice, l.price_currency)}
                  </p>
                  <p className="text-sm text-gray-500">
                    to {fmtPrice(maxPrice, l.price_currency)}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {l.description && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Description</h2>
          <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
            {l.description}
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Price History ({priceHistory.length})
          </h2>
        </div>
        {priceHistory.length > 1 && (
          <PriceHistoryChart history={priceHistory} currency={l.price_currency} />
        )}
        {priceHistory.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">
            No price history recorded
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Date Observed</th>
                  <th className="px-4 py-3">Source Updated</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Price/m\u00B2</th>
                  <th className="px-4 py-3">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {priceHistory.map((h, i) => {
                  const prev = i > 0 ? priceHistory[i - 1] : null;
                  return (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fmtDateTime(h.observed_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {fmtDateTime(h.source_updated_at)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                        {fmtPrice(h.price_amount, h.price_currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                        {fmtPrice(h.price_per_m2, h.price_currency)}
                      </td>
                      <td className="px-4 py-3">
                        <PriceChangeTag
                          current={h.price_amount}
                          previous={prev?.price_amount}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

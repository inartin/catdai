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

"use client";

import { useEffect, useState, useCallback } from "react";
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

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtChange(n) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(Math.round(n))} \u20AC`;
}

function fmtSignedPrice(amount, currency) {
  if (amount == null) return "\u2014";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "\u2014";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${fmtPrice(Math.abs(value), currency)}`;
}

function StatCard({ label, value, detail }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-400">{detail}</p>}
    </div>
  );
}

function DirectionCard({ label, value, color, detail }) {
  const colorClasses = {
    green: "border-green-200 bg-green-50",
    red: "border-red-200 bg-red-50",
    gray: "border-gray-100 bg-white",
  };
  const valueClasses = {
    green: "text-green-700",
    red: "text-red-700",
    gray: "text-gray-900",
  };
  return (
    <div
      className={`rounded-xl p-4 shadow-sm border ${colorClasses[color] || colorClasses.gray}`}
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${valueClasses[color] || valueClasses.gray}`}
      >
        {value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
];

function PeriodToggle({ selected, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${selected === opt.key
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-500 hover:text-gray-700"
            }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DistributionTable({ title, data }) {
  if (!data || data.length === 0) return null;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0">
            <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
              <th className="px-4 py-2">{title.replace("By ", "")}</th>
              <th className="px-4 py-2 text-right">Count</th>
              <th className="px-4 py-2 text-right">Avg Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row) => (
              <tr key={row.key} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-700">
                  {row.key}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {fmtNum(row.count)}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {fmtPrice(row.avgPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceChangeListingsSection({ listings }) {
  const rows = Array.isArray(listings) ? listings : [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Listings With Multiple Price Changes</h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No listings with multiple price history entries.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3 text-right">Current Price</th>
                <th className="px-4 py-3 text-right">Last Change</th>
                <th className="px-4 py-3 text-right">History</th>
                <th className="px-4 py-3 text-right">Range</th>
                <th className="px-4 py-3">Latest</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((l) => {
                const lastChange = l.last_change_amount == null ? null : Number(l.last_change_amount);
                const changeClass =
                  lastChange > 0
                    ? "text-red-600"
                    : lastChange < 0
                      ? "text-green-600"
                      : "text-gray-600";

                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-sm">
                      <Link
                        href={`/admin/listings/${l.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {l.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-400 truncate">
                        {[l.district, l.sector].filter(Boolean).join(", ") || "\u2014"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                      {fmtPrice(l.price_amount ?? l.latest_history_price, l.price_currency)}
                    </td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap font-medium ${changeClass}`}>
                      {fmtSignedPrice(l.last_change_amount, l.price_currency)}
                      <span className="ml-1 text-xs text-gray-400">
                        {fmtPct(l.last_change_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600">
                      {fmtNum(l.history_count)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600">
                      {fmtPrice(l.min_history_price, l.price_currency)} - {fmtPrice(l.max_history_price, l.price_currency)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {fmtDate(l.latest_observed_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          l.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {l.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SortHeader({ col, sortBy, sortAsc, onSort, children }) {
  return (
    <th
      className="px-4 py-3 cursor-pointer select-none hover:text-gray-700"
      onClick={() => onSort(col)}
    >
      {children}
      {sortBy === col && (
        <span className="ml-1">{sortAsc ? "\u2191" : "\u2193"}</span>
      )}
    </th>
  );
}

export default function ListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [roomsFilter, setRoomsFilter] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);
  const [period, setPeriod] = useState("7d");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (activeFilter !== "all") params.set("active", activeFilter);
    if (roomsFilter) params.set("rooms", roomsFilter);
    params.set("sortBy", sortBy);
    params.set("sortAsc", String(sortAsc));
    params.set("page", String(page));

    const res = await fetch(`/api/admin/listings?${params}`);
    const json = await res.json();

    setListings(json.data || []);
    setTotal(json.total || 0);
    setLoading(false);
  }, [search, activeFilter, roomsFilter, page, sortBy, sortAsc]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchListings(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchListings]);

  useEffect(() => {
    fetch("/api/admin/listings/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setStatsLoading(false);
      })
      .catch((err) => {
        setStatsError(err.message || "Failed to load listing stats");
        setStatsLoading(false);
      });
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const md = stats?.marketDirection?.[period] || {};
  const pc = md.priceChanges || {};
  const netChange = (md.newListings || 0) - (md.removedListings || 0);

  function handleSort(col) {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Listings</h1>

      {statsLoading ? (
        <div className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-400">
          Loading listing stats...
        </div>
      ) : statsError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-600">
          Failed to load listing stats: {statsError}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total Listings" value={fmtNum(stats.totalListings)} />
            <StatCard label="Active" value={fmtNum(stats.activeListings)} />
            <StatCard
              label="Inactive"
              value={fmtNum(stats.totalListings - stats.activeListings)}
            />
            <StatCard label="Owners" value={fmtNum(stats.totalOwners)} />
            <StatCard label="Avg Price" value={fmtPrice(stats.avgPrice)} />
            <StatCard label="Avg Price/m\u00B2" value={fmtPrice(stats.avgPricePerM2)} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Market Direction
              </h2>
              <PeriodToggle selected={period} onChange={setPeriod} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <DirectionCard
                label="New Ads"
                value={fmtNum(md.newListings)}
                color="green"
              />
              <DirectionCard
                label="Removed"
                value={fmtNum(md.removedListings)}
                color="red"
              />
              <DirectionCard
                label="Net Change"
                value={`${netChange >= 0 ? "+" : ""}${fmtNum(netChange)}`}
                color={netChange > 0 ? "green" : netChange < 0 ? "red" : "gray"}
              />
              <DirectionCard
                label="Price Changes"
                value={fmtNum(pc.total)}
                color="gray"
                detail={
                  pc.total > 0
                    ? `${fmtNum(pc.up)} up / ${fmtNum(pc.down)} down`
                    : null
                }
              />
              <DirectionCard
                label="Avg Change"
                value={fmtChange(pc.avgChange)}
                color={
                  pc.avgChange > 0 ? "green" : pc.avgChange < 0 ? "red" : "gray"
                }
                detail={fmtPct(pc.avgChangePct)}
              />
              <DirectionCard
                label="Price Direction"
                value={
                  pc.total > 0
                    ? pc.down > pc.up
                      ? "Falling"
                      : pc.up > pc.down
                        ? "Rising"
                        : "Stable"
                    : "\u2014"
                }
                color={
                  pc.total > 0
                    ? pc.down > pc.up
                      ? "red"
                      : pc.up > pc.down
                        ? "green"
                        : "gray"
                    : "gray"
                }
                detail={
                  pc.total > 0
                    ? `${Math.round((Math.max(pc.up, pc.down) / pc.total) * 100)}% of changes`
                    : null
                }
              />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <DistributionTable title="By District" data={stats.byDistrict} />
            <DistributionTable title="By Rooms" data={stats.byRooms} />
            <DistributionTable title="By Renovation" data={stats.byRenovation} />
            <DistributionTable title="By Building Type" data={stats.byBuildingType} />
          </div>

          <PriceChangeListingsSection listings={stats.priceChangeListings} />

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Recent Listings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Area</th>
                    <th className="px-4 py-3">Rooms</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.recentListings.map((l) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 max-w-xs truncate">
                        {l.source_url ? (
                          <a
                            href={l.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {l.title}
                          </a>
                        ) : (
                          l.title
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fmtPrice(l.price_amount, l.price_currency)}
                      </td>
                      <td className="px-4 py-3">
                        {l.area_m2 ? `${l.area_m2} m\u00B2` : "\u2014"}
                      </td>
                      <td className="px-4 py-3">{l.rooms_count ?? "\u2014"}</td>
                      <td className="px-4 py-3">
                        {[l.district, l.sector].filter(Boolean).join(", ") ||
                          "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${l.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                            }`}
                        >
                          {l.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {fmtDate(l.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search by title..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary w-64"
        />
        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          value={roomsFilter}
          onChange={(e) => {
            setRoomsFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        >
          <option value="">All Rooms</option>
          {[1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>
              {r} room{r > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-gray-500">
          {fmtNum(total)} results
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <SortHeader col="title" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Title
                </SortHeader>
                <SortHeader col="price_amount" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Price
                </SortHeader>
                <SortHeader col="area_m2" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Area
                </SortHeader>
                <SortHeader col="rooms_count" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Rooms
                </SortHeader>
                <th className="px-4 py-3">Floor</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Status</th>
                <SortHeader col="created_at" sortBy={sortBy} sortAsc={sortAsc} onSort={handleSort}>
                  Date
                </SortHeader>
                <th className="px-4 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No listings found
                  </td>
                </tr>
              ) : (
                listings.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 max-w-xs truncate">
                      <Link
                        href={`/admin/listings/${l.id}`}
                        className="text-primary hover:underline"
                      >
                        {l.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtPrice(l.price_amount, l.price_currency)}
                    </td>
                    <td className="px-4 py-3">
                      {l.area_m2 ? `${l.area_m2} m\u00B2` : "\u2014"}
                    </td>
                    <td className="px-4 py-3">{l.rooms_count ?? "\u2014"}</td>
                    <td className="px-4 py-3">
                      {l.floor != null
                        ? `${l.floor}/${l.total_floors || "?"}`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {[l.district, l.sector].filter(Boolean).join(", ") ||
                        "\u2014"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          l.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {l.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {fmtDate(l.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {l.owner_id ? (
                        <Link
                          href={`/admin/owners/${l.owner_id}`}
                          className="text-primary hover:underline text-xs"
                        >
                          View
                        </Link>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

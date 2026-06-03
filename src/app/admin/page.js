"use client";

import { useCallback, useEffect, useState } from "react";

function fmtNum(n) {
  if (n == null) return "\u2014";
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

function fmtPrice(amount, currency) {
  if (amount == null) return "\u2014";
  return `${fmtNum(amount)} ${currency || "\u20AC"}`;
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

function fmtBool(value) {
  return value ? "Yes" : "No";
}

function fmtCadastruSearchType(type) {
  if (type === "address") return "Address";
  if (type === "number") return "Cadastral number";
  return type || "\u2014";
}

function fmtCadastruResultType(type) {
  if (type === "no_data") return "No data";
  if (type === "address_only") return "Address only";
  if (type === "apartment_only") return "Apartment only";
  if (type === "full_data") return "Full data";
  return type || "\u2014";
}

function fmtCadastruResultSummary(byResultType) {
  const counts = byResultType || {};
  const parts = [
    ["full_data", "full"],
    ["apartment_only", "apartment"],
    ["address_only", "address"],
    ["no_data", "none"],
  ]
    .map(([key, label]) => counts[key] ? `${fmtNum(counts[key])} ${label}` : null)
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "No result data yet";
}

function fmtListingLinkStatus(status) {
  if (status === "success") return "Analyzed";
  if (status === "unsupported_listing_type") return "Rejected type";
  if (status === "not_chisinau") return "Outside Chișinău";
  if (status === "insufficient_data") return "Insufficient data";
  if (status === "not_a_listing") return "Not a listing";
  if (status === "fetch_failed") return "Fetch failed";
  if (status === "upstream_blocked") return "Upstream blocked";
  return status || "\u2014";
}

function fmtListingLinkProperty(row) {
  return [
    row.rooms_count ? `${row.rooms_count} rooms` : null,
    row.district,
    row.city,
  ].filter(Boolean).join(" · ") || "\u2014";
}

function fmtTopDistricts(byDistrict) {
  const entries = Object.entries(byDistrict || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (!entries.length) return "No district data yet";
  return entries.map(([district, count]) => `${district}: ${fmtNum(count)}`).join(" · ");
}

const BASE_FILTER_LABELS = {
  city: "City",
  district: "District",
  rooms_count: "Rooms",
  area_m2: "Area",
  floor: "Floor",
  total_floors: "Total floors",
  building_type: "Building type",
  renovation: "Renovation",
  bathrooms_count: "Bathrooms",
  balconies_count: "Balconies",
};

const ALERT_FILTER_LABELS = {
  price_min: "Min price",
  price_max: "Max price",
  max_price_per_m2: "Max price/m\u00B2",
  area_min: "Min area",
  area_max: "Max area",
  floor_min: "Min floor",
  floor_max: "Max floor",
  first_floor: "First floor",
  last_floor: "Last floor",
  seller_type: "Seller type",
};

function fmtAlertValue(key, value) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (key.includes("price")) return fmtPrice(value);
  if (key.includes("area")) return `${fmtNum(value)} m\u00B2`;
  if (typeof value === "object") return null;
  return String(value);
}

function fmtFilterSummary(filters, labels) {
  if (!filters || typeof filters !== "object") return "\u2014";

  const parts = Object.entries(labels)
    .map(([key, label]) => {
      const value = fmtAlertValue(key, filters[key]);
      return value ? `${label}: ${value}` : null;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" \u00B7 ") : "\u2014";
}

function fmtProperty(row) {
  return [
    row.roomsCount ? `${row.roomsCount} rooms` : null,
    row.areaM2 ? `${fmtNum(row.areaM2)} m\u00B2` : null,
    row.district,
    row.city,
  ].filter(Boolean).join(" · ") || "\u2014";
}

function StatCard({ label, value, detail, onClick, active = false }) {
  const cardClassName = `bg-white rounded-xl p-5 shadow-sm border transition-colors ${active
    ? "border-primary/40 ring-1 ring-primary/20"
    : "border-gray-100"
    }`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cardClassName} text-left hover:border-primary/40 hover:ring-1 hover:ring-primary/20 cursor-pointer`}
      >
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        {detail && <p className="mt-1 text-xs text-gray-400">{detail}</p>}
      </button>
    );
  }

  return (
    <div className={cardClassName}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-400">{detail}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [showUsersList, setShowUsersList] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [activeEstimationsType, setActiveEstimationsType] = useState(null);
  const [estimations, setEstimations] = useState([]);
  const [estimationsLoading, setEstimationsLoading] = useState(false);
  const [estimationsError, setEstimationsError] = useState(null);
  const [showTelegramAlertsList, setShowTelegramAlertsList] = useState(false);
  const [showPdfGenerationList, setShowPdfGenerationList] = useState(false);
  const [showCadastruSearchesList, setShowCadastruSearchesList] = useState(false);
  const [showListingLinkAnalysesList, setShowListingLinkAnalysesList] = useState(false);

  const loadStats = useCallback(async ({ fresh = false } = {}) => {
    if (fresh) setStatsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/stats${fresh ? "?fresh=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err.message || "Failed to load stats");
    } finally {
      setLoading(false);
      setStatsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setUsersError(err.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleUsersList = () => {
    const next = !showUsersList;
    setShowUsersList(next);
    if (next && users.length === 0 && !usersLoading) {
      loadUsers();
    }
  };

  const loadEstimations = async (type) => {
    setEstimationsLoading(true);
    setEstimationsError(null);
    setEstimations([]);
    try {
      const res = await fetch(`/api/admin/estimations?type=${type}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEstimations(Array.isArray(data.estimations) ? data.estimations : []);
    } catch (err) {
      setEstimationsError(err.message || "Failed to load estimations");
    } finally {
      setEstimationsLoading(false);
    }
  };

  const toggleEstimationsList = (type) => {
    if (activeEstimationsType === type) {
      setActiveEstimationsType(null);
      return;
    }
    setActiveEstimationsType(type);
    loadEstimations(type);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !stats) {
    const isAuthError = String(error || "").includes("401");
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          {isAuthError ? (
            <>
              <p className="text-red-500 font-medium">Session Expired</p>
            </>
          ) : (
            <>
              <p className="text-red-500 font-medium">Failed to load dashboard</p>
              <p className="text-sm text-gray-400">{error}</p>
              <button
                onClick={() => loadStats({ fresh: true })}
                disabled={statsRefreshing}
                className="mt-2 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                {statsRefreshing ? "Refreshing..." : "Retry"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const s = stats;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          type="button"
          onClick={() => loadStats({ fresh: true })}
          disabled={statsRefreshing}
          className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:border-primary/40 hover:text-primary disabled:text-gray-400 disabled:hover:border-gray-200 transition-colors"
        >
          {statsRefreshing ? "Refreshing..." : "Hard refresh"}
        </button>
      </div>

      {/* Users & App Usage */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Users & App Usage</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-4">
          <StatCard
            label="Registered Users"
            value={fmtNum(s.totalUsers)}
            detail={showUsersList ? "Click to hide list" : "Click to view all users"}
            onClick={toggleUsersList}
            active={showUsersList}
          />
          <StatCard
            label="Sale Estimations"
            value={fmtNum(s.totalSaleEstimations ?? s.totalEstimations)}
            detail={activeEstimationsType === "sale" ? "Click to hide list" : "Click to view recent sale estimations"}
            onClick={() => toggleEstimationsList("sale")}
            active={activeEstimationsType === "sale"}
          />
          <StatCard
            label="Rent Estimations"
            value={fmtNum(s.totalRentEstimations)}
            detail={activeEstimationsType === "rent" ? "Click to hide list" : "Click to view recent rent estimations"}
            onClick={() => toggleEstimationsList("rent")}
            active={activeEstimationsType === "rent"}
          />
          <StatCard
            label="Cadastru Searches"
            value={fmtNum(s.cadastruSearches?.total)}
            detail={showCadastruSearchesList ? "Click to hide list" : fmtCadastruResultSummary(s.cadastruSearches?.byResultType)}
            onClick={() => setShowCadastruSearchesList((value) => !value)}
            active={showCadastruSearchesList}
          />
          <StatCard
            label="999 Link Analyses"
            value={fmtNum(s.listingLinkAnalyses?.total)}
            detail={showListingLinkAnalysesList ? "Click to hide list" : `${fmtNum(s.listingLinkAnalyses?.success)} analyzed / ${fmtNum(s.listingLinkAnalyses?.unsupported)} rejected`}
            onClick={() => setShowListingLinkAnalysesList((value) => !value)}
            active={showListingLinkAnalysesList}
          />
          <StatCard
            label="PDF Reports"
            value={fmtNum(s.pdfGeneration?.total)}
            detail={showPdfGenerationList ? "Click to hide list" : `${fmtNum(s.pdfGeneration?.registered)} registered / ${fmtNum(s.pdfGeneration?.anonymous)} anonymous`}
            onClick={() => setShowPdfGenerationList((value) => !value)}
            active={showPdfGenerationList}
          />
          <StatCard label="Shared Links" value={fmtNum(s.totalSharedLinks)} />
          <StatCard label="Favorites" value={fmtNum(s.totalFavorites)} />
          <StatCard
            label="Telegram Alerts"
            value={fmtNum(s.totalTelegramAlerts)}
            detail={showTelegramAlertsList ? "Click to hide list" : "Click to view alerts"}
            onClick={() => setShowTelegramAlertsList((value) => !value)}
            active={showTelegramAlertsList}
          />
        </div>
        {showUsersList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Registered Users</h3>
              <button
                type="button"
                onClick={loadUsers}
                disabled={usersLoading}
                className="text-xs text-primary hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {usersLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {usersError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-500 font-medium">Failed to load users</p>
                <p className="text-xs text-gray-400 mt-1">{usersError}</p>
              </div>
            ) : usersLoading && users.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No users found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Last Visit</th>
                      <th className="px-4 py-3 text-right">Estimations</th>
                      <th className="px-4 py-3 text-right">Shared Links</th>
                      <th className="px-4 py-3 text-right">Favorites</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {u.name || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(u.lastVisitAt)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtNum(u.totalEstimations)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtNum(u.sharedLinks)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtNum(u.favorites)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {activeEstimationsType && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Recent {activeEstimationsType === "rent" ? "Rent" : "Sale"} Estimations
              </h3>
              <button
                type="button"
                onClick={() => loadEstimations(activeEstimationsType)}
                disabled={estimationsLoading}
                className="text-xs text-primary hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {estimationsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {estimationsError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-500 font-medium">Failed to load estimations</p>
                <p className="text-xs text-gray-400 mt-1">{estimationsError}</p>
              </div>
            ) : estimationsLoading && estimations.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">Loading estimations...</div>
            ) : estimations.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No estimations found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Estimate</th>
                      <th className="px-4 py-3 text-right">Shared</th>
                      <th className="px-4 py-3 text-right">Favorite</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {estimations.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          <div>{fmtProperty(row)}</div>
                          <div className="mt-0.5 text-xs font-normal text-gray-500">
                            {[row.buildingType, row.renovation].filter(Boolean).join(" · ") || "\u2014"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.isAnonymous ? "Anonymous" : row.userName || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPrice(row.estimatedPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtBool(row.shared)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtBool(row.favorited)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showPdfGenerationList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">PDF Reports</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.pdfGeneration?.periods?.["24h"])} in 24h · {fmtNum(s.pdfGeneration?.periods?.["7d"])} in 7 days · {fmtNum(s.pdfGeneration?.withCadastral)} with cadastral
              </p>
            </div>

            {!Array.isArray(s.pdfGeneration?.recent) || s.pdfGeneration.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No PDF reports generated</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Cadastral</th>
                      <th className="px-4 py-3">Session</th>
                      <th className="px-4 py-3">Estimate Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.pdfGeneration.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium break-all">
                          {row.user_id || "Anonymous"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtBool(row.included_cadastral)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all">
                          {row.session_id || row.device_id || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all">
                          {row.estimate_log_id || "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showCadastruSearchesList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Cadastru Searches</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.cadastruSearches?.periods?.["24h"])} in 24h · {fmtNum(s.cadastruSearches?.periods?.["7d"])} in 7 days · {fmtNum(s.cadastruSearches?.registered)} registered / {fmtNum(s.cadastruSearches?.anonymous)} anonymous
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.cadastruSearches?.address)} address / {fmtNum(s.cadastruSearches?.number)} number · {fmtCadastruResultSummary(s.cadastruSearches?.byResultType)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {fmtTopDistricts(s.cadastruSearches?.byDistrict)}
              </p>
            </div>

            {!Array.isArray(s.cadastruSearches?.recent) || s.cadastruSearches.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No cadastru searches found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3">Cadastral number</th>
                      <th className="px-4 py-3">District</th>
                      <th className="px-4 py-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.cadastruSearches.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {fmtCadastruSearchType(row.search_type)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtCadastruResultType(row.result_type)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {row.cadastral_number || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.district || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          {row.user_id || "Anonymous"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showListingLinkAnalysesList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">999 Link Analyses</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.listingLinkAnalyses?.periods?.["24h"])} in 24h · {fmtNum(s.listingLinkAnalyses?.periods?.["7d"])} in 7 days · {fmtNum(s.listingLinkAnalyses?.failed)} failed
              </p>
            </div>

            {!Array.isArray(s.listingLinkAnalyses?.recent) || s.listingLinkAnalyses.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No 999 link analyses found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Listing</th>
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.listingLinkAnalyses.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {fmtListingLinkStatus(row.status)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          {row.listing_url ? (
                            <a
                              href={row.listing_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              {row.external_id || row.listing_url}
                            </a>
                          ) : (
                            row.external_id || "\u2014"
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtListingLinkProperty(row)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPrice(row.listing_price, row.listing_currency)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          {row.user_id || "Anonymous"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showTelegramAlertsList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Telegram Alerts</h3>
            </div>

            {!Array.isArray(s.telegramAlerts) || s.telegramAlerts.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No Telegram alerts found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Alert</th>
                      <th className="px-4 py-3">Chat ID</th>
                      <th className="px-4 py-3">Base Filters</th>
                      <th className="px-4 py-3">Notification Filters</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Last Notified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.telegramAlerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3 text-gray-900 font-medium min-w-48">
                          <div>{alert.label || "\u2014"}</div>
                          <div className="mt-0.5 text-xs font-normal text-gray-400">
                            {alert.user_id || "\u2014"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {alert.telegram_chat_id || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 min-w-64">
                          {fmtFilterSummary(alert.base_filters, BASE_FILTER_LABELS)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 min-w-64">
                          {fmtFilterSummary(alert.alert_filters, ALERT_FILTER_LABELS)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${alert.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                              }`}
                          >
                            {alert.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {fmtDateTime(alert.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {fmtDateTime(alert.last_notified_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

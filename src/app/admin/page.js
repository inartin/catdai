"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function fmtNum(n) {
  if (n == null) return "\u2014";
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

function fmtPrice(amount, currency) {
  if (amount == null) return "\u2014";
  return `${fmtNum(amount)} ${currency || "\u20AC"}`;
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
  return new Date(d).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("7d");
  const [showUsersList, setShowUsersList] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load stats");
        setLoading(false);
      });
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !stats) {
    const isAuthError = error.includes("401");
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
                onClick={() => window.location.reload()}
                className="mt-2 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const s = stats;
  const md = s.marketDirection?.[period] || {};
  const pc = md.priceChanges || {};
  const netChange = (md.newListings || 0) - (md.removedListings || 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Users & App Usage */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Users & App Usage</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Registered Users"
            value={fmtNum(s.totalUsers)}
            detail={showUsersList ? "Click to hide list" : "Click to view all users"}
            onClick={toggleUsersList}
            active={showUsersList}
          />
          <StatCard label="Total Estimations" value={fmtNum(s.totalEstimations)} />
          <StatCard label="Shared Links" value={fmtNum(s.totalSharedLinks)} />
          <StatCard label="Favorites" value={fmtNum(s.totalFavorites)} />
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
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Listings" value={fmtNum(s.totalListings)} />
        <StatCard label="Active" value={fmtNum(s.activeListings)} />
        <StatCard
          label="Inactive"
          value={fmtNum(s.totalListings - s.activeListings)}
        />
        <StatCard label="Owners" value={fmtNum(s.totalOwners)} />
        <StatCard label="Avg Price" value={fmtPrice(s.avgPrice)} />
        <StatCard label="Avg Price/m\u00B2" value={fmtPrice(s.avgPricePerM2)} />
      </div>

      {/* Market Direction */}
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
        <DistributionTable title="By District" data={s.byDistrict} />
        <DistributionTable title="By Rooms" data={s.byRooms} />
        <DistributionTable title="By Renovation" data={s.byRenovation} />
        <DistributionTable title="By Building Type" data={s.byBuildingType} />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Listings</h2>
          <Link
            href="/admin/listings"
            className="text-xs text-primary hover:underline"
          >
            View all
          </Link>
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
              {s.recentListings.map((l) => (
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
    </div>
  );
}

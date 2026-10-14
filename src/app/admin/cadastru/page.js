"use client";

import { useCallback, useEffect, useState } from "react";
import AdminCadastruOfflineSearch from "@/components/admin/AdminCadastruOfflineSearch";

const fmtNum = (value) => Number(value).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
const percent = (value, total) => total ? Math.round(value / total * 100) : 0;
const datasets = [
  ["cadastru", "Building details", "Shared cadastral data"],
  ["nearby", "Nearby places", "Schools, shops, parks and more"],
  ["transport", "Public transport", "Routes serving the area"],
  ["reports", "Municipal reports", "Available for Chișinău"],
];

function StatCard({ label, value, detail, accent = false }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-primary/20 bg-primary/5" : "border-gray-200 bg-white"}`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{fmtNum(value)}</p>
      <p className="mt-2 text-xs leading-5 text-gray-500">{detail}</p>
    </div>
  );
}

export default function AdminCadastruPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadStats = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/cadastru-storage${fresh ? "?fresh=1" : ""}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStats(await response.json());
    } catch {
      setStats({ available: false });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cadastru</h1>
          <p className="mt-1 text-sm text-gray-500">Your stored property data, organized by building.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {stats?.available && <span className="text-xs text-gray-500">Updated {new Date(stats.updatedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button type="button" onClick={() => loadStats(true)} disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:text-primary disabled:text-gray-400">
            {loading ? "Refreshing…" : "Hard refresh"}
          </button>
        </div>
      </header>

      {loading && !stats ? (
        <div role="status" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => <div key={key} className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />)}
          <span className="sr-only">Loading stored data overview…</span>
        </div>
      ) : stats?.available ? (
        <div className="space-y-6" aria-busy={loading}>
          <section aria-label="Stored property totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Apartment buildings" value={stats.buildings} detail="Verified blocks · shared details stored once" accent />
            <StatCard label="Apartments / units" value={stats.apartments.total}
              detail={`${fmtNum(stats.apartments.linked)} linked to shared buildings`} />
            <StatCard label="Units with details" value={stats.apartments.details}
              detail={`${fmtNum(stats.apartments.references)} references still awaiting details`} />
            <StatCard label="Other properties" value={stats.other} detail="Land, other buildings and unclassified records" />
          </section>

          <section aria-labelledby="building-coverage-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
              <div>
                <h2 id="building-coverage-heading" className="text-lg font-semibold text-gray-900">Building data coverage</h2>
                <p className="mt-1 text-sm text-gray-500">Each dataset is counted once per apartment building.</p>
              </div>
              <div className="rounded-lg bg-primary/5 px-4 py-2 text-right">
                <p className="text-lg font-semibold tabular-nums text-primary">{fmtNum(stats.allCategories)} <span className="text-sm font-normal text-gray-500">/ {fmtNum(stats.buildings)}</span></p>
                <p className="text-xs text-gray-500">with all applicable datasets saved</p>
              </div>
            </div>
            <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-y-0">
              {datasets.map(([key, label, detail]) => {
                const item = stats.coverage[key];
                const share = percent(item.saved, item.total);
                return (
                  <div key={key} className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="text-sm font-semibold text-gray-900">{label}</h3><p className="mt-1 text-xs text-gray-500">{detail}</p></div>
                      <p className="text-sm font-semibold tabular-nums text-gray-900">{fmtNum(item.saved)} <span className="font-normal text-gray-500">/ {fmtNum(item.total)}</span></p>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${label} saved coverage`} aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${share}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs tabular-nums">
                      <span className="text-gray-500">{share}% saved · {fmtNum(item.total - item.saved)} missing</span>
                      <span className="text-gray-500"><span className="text-primary">{fmtNum(item.fresh)} fresh</span> · {fmtNum(item.saved - item.fresh)} expired</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-gray-100 px-5 py-3 text-xs leading-5 text-gray-500 sm:px-6">Expired snapshots remain stored. Coverage shows saved datasets, not a guarantee that every apartment or source field is available.</p>
          </section>

          <section aria-labelledby="collection-heading" className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <div className="mb-5"><h2 id="collection-heading" className="text-lg font-semibold text-gray-900">Building collection</h2>
              <p className="mt-1 text-sm text-gray-500">Saved results of whole-building cadastral collection.</p></div>
            <dl className="grid gap-4 sm:grid-cols-3">
              {[["harvested", "Harvested", "Building and observed unit details saved", "text-primary"],
                ["partial", "Partial harvest", "Unit details still missing from the response", "text-amber-800"],
                ["notHarvested", "Not harvested yet", "May already contain individual apartment lookups", "text-gray-900"]].map(([key, label, detail, color]) => (
                <div key={key} className="rounded-lg bg-gray-50 p-4">
                  <dt className="text-sm text-gray-600">{label}</dt><dd className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{fmtNum(stats.collection[key])}</dd>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{detail}</p>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-gray-500">These are database results, not the collector’s live queue or running status.</p>
          </section>

          <section aria-labelledby="city-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-5 sm:px-6">
              <h2 id="city-heading" className="text-lg font-semibold text-gray-900">Stored data by city</h2>
              <p className="text-sm text-gray-500"><span className="font-semibold tabular-nums text-gray-900">{fmtNum(stats.total)}</span> unique cadastral numbers overall</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500"><tr>
                  {[["City", "text-left"], ["Apartment buildings", "text-right"], ["Apartments / units", "text-right"], ["Other properties", "text-right"]].map(([label, align]) =>
                    <th key={label} scope="col" className={`whitespace-nowrap px-5 py-3 font-medium ${align}`}>{label}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.byCity.map((row) => <tr key={row.city} className="hover:bg-gray-50">
                    <th scope="row" className="px-5 py-3 text-left font-medium text-gray-700">{row.city}</th>
                    {[row.buildings, row.apartments, row.other].map((value, index) => <td key={index} className="px-5 py-3 text-right tabular-nums text-gray-900">{fmtNum(value)}</td>)}
                  </tr>)}
                  {!stats.byCity.length && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">No cadastru data stored yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-xs text-gray-500">All-time database inventory, including expired records. Buildings appearing in multiple tables are counted once.</p>
        </div>
      ) : <p role="alert" className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Stored cadastru statistics are temporarily unavailable. Try Hard refresh.</p>}

      <AdminCadastruOfflineSearch />
    </div>
  );
}

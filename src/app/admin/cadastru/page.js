"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import AdminCadastruOfflineSearch from "@/components/admin/AdminCadastruOfflineSearch";
import AdminCadastruAddressReuse from "@/components/admin/AdminCadastruAddressReuse";
import AdminCollectorStatus from "@/components/admin/AdminCollectorStatus";

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
  const [cityStats, setCityStats] = useState(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);
  const [reuseRefresh, setReuseRefresh] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const loadStats = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/cadastru-storage?view=overview${fresh ? "&fresh=1" : ""}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStats(await response.json());
    } catch {
      setStats({ available: false });
    } finally {
      setLoading(false);
    }
  }, []);
  const loadCities = useCallback(async (fresh = false) => {
    setCitiesLoading(true);
    try {
      const response = await fetch(`/api/admin/cadastru-storage?view=cities${fresh ? "&fresh=1" : ""}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setCityStats(await response.json());
    } catch {
      setCityStats({ available: false });
    } finally {
      setCitiesLoading(false);
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
          <button type="button" onClick={() => {
            setReuseRefresh((value) => value + 1);
            loadStats(true);
            if (cityStats !== null) loadCities(true);
          }} disabled={loading || citiesLoading}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-default disabled:text-gray-400">
            {loading || citiesLoading ? "Refreshing…" : "Hard refresh"}
          </button>
        </div>
      </header>

      {loading && !stats ? (
        <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((key) => <div key={key} className="h-36 animate-pulse rounded-xl border border-gray-200 bg-white" />)}
          <span className="sr-only">Loading stored data overview…</span>
        </div>
      ) : stats?.available ? (
        <div className="space-y-6" aria-busy={loading}>
          <section aria-label="Stored property totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Full cadastral records" value={stats.fullData} detail="Unique numbers with full cadastral data" accent />
            <StatCard label="Apartment buildings" value={stats.buildings} detail="Verified blocks" />
            <StatCard label="Apartments" value={stats.apartments.total}
              detail={`${fmtNum(stats.apartments.linked)} linked to shared buildings`} />
            <StatCard label="Units with details" value={stats.apartments.details}
              detail={`${fmtNum(stats.apartments.references)} references still awaiting details`} />
            <StatCard label="Other properties" value={stats.other} detail="Land, other buildings and unclassified records" />
          </section>

          <section aria-labelledby="building-coverage-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
              <div>
                <h2 id="building-coverage-heading" className="text-lg font-semibold text-gray-900">Stored data coverage</h2>
                <p className="mt-1 text-sm text-gray-500">Address totals include data saved before apartment-building details are available.</p>
              </div>
              <div className="rounded-lg bg-primary/5 px-4 py-2 text-right">
                <p className="text-lg font-semibold tabular-nums text-primary">{fmtNum(stats.allCategories)} <span className="text-sm font-normal text-gray-500">/ {fmtNum(stats.buildings)}</span></p>
                <p className="text-xs text-gray-500">apartment buildings with all datasets saved</p>
              </div>
            </div>
            <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-y-0">
              {datasets.map(([key, label, detail]) => {
                const item = stats.coverage[key];
                const stored = key === "cadastru" ? item : stats.storedDatasets[key];
                const share = percent(item.saved, item.total);
                return (
                  <div key={key} className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="text-sm font-semibold text-gray-900">{label}</h3><p className="mt-1 text-xs text-gray-500">{detail}</p></div>
                      <div className="text-right tabular-nums">
                        <p className="text-lg font-semibold text-gray-900">{fmtNum(stored.saved)}</p>
                        <p className="text-xs text-gray-500">{key === "cadastru" ? "buildings saved" : "address snapshots saved"}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs tabular-nums text-gray-500">{fmtNum(stored.fresh)} fresh · {fmtNum(stored.saved - stored.fresh)} expired</p>
                    <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                      <span>Apartment-building coverage</span>
                      <span className="tabular-nums">{fmtNum(item.saved)} / {fmtNum(item.total)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={`${label} apartment-building coverage`} aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${share}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs tabular-nums">
                      <span className="text-gray-500">{share}% saved · {fmtNum(item.total - item.saved)} missing</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-gray-100 px-5 py-3 text-xs leading-5 text-gray-500 sm:px-6">Totals count saved lookup addresses; coverage bars count verified apartment buildings. Expired snapshots remain stored.</p>
          </section>

        </div>
      ) : <p role="alert" className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Stored cadastru statistics are temporarily unavailable. Try Hard refresh.</p>}

      <AdminCollectorStatus refreshKey={reuseRefresh} />

      <section aria-labelledby="property-search-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-5 sm:p-6">
          <h2 id="property-search-heading" className="text-lg font-semibold text-gray-900">Search stored properties</h2>
          <p id="property-search-help" className="mt-1 text-xs text-gray-500">Search all cities by address or cadastral number to see the same stored properties and search counts as the city list.</p>
          <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
            event.preventDefault();
            setSearchQuery(searchInput.trim());
            setSearchRevision((value) => value + 1);
          }}>
            <div className="min-w-48 flex-1">
              <label htmlFor="property-search" className="mb-1.5 block text-sm font-medium text-gray-700">Address or cadastral number</label>
              <input id="property-search" type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
                required minLength={2} maxLength={200} aria-describedby="property-search-help" placeholder="Decebal 63 or 0100106.131.01.051"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" disabled={searchInput.trim().length < 2} className="cursor-pointer rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-default disabled:opacity-50">Search</button>
            {searchQuery && <button type="button" onClick={() => { setSearchInput(""); setSearchQuery(""); }}
              className="cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:text-primary">Clear</button>}
          </form>
        </div>
        {searchQuery && <AdminCadastruAddressReuse key={`search:${searchQuery}:${searchRevision}:${reuseRefresh}`} query={searchQuery} />}
      </section>

      <section aria-labelledby="city-heading" aria-busy={citiesLoading} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 p-5 sm:px-6">
          <div><h2 id="city-heading" className="text-lg font-semibold text-gray-900">Stored data by city</h2>
            <p className="mt-1 text-xs text-gray-500">Select a city to see stored properties and search counts.</p></div>
          {!cityStats?.available && <button type="button" onClick={() => loadCities(!!cityStats)} disabled={citiesLoading}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-default disabled:text-gray-400">
            {citiesLoading ? "Loading cities…" : cityStats ? "Retry" : "Load cities"}
          </button>}
          {cityStats?.available && stats?.available && <p className="text-sm text-gray-500"><span className="font-semibold tabular-nums text-gray-900">{fmtNum(stats.total)}</span> unique cadastral numbers overall</p>}
        </div>
        {cityStats?.available ? <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500"><tr>
              {[["City", "text-left"], ["Apartment buildings", "text-right"], ["Apartments", "text-right"], ["Other properties", "text-right"]].map(([label, align]) =>
                <th key={label} scope="col" className={`whitespace-nowrap px-5 py-3 font-medium ${align}`}>{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {cityStats.byCity.map((row, index) => <Fragment key={row.city}>
                <tr onClick={() => setSelectedCity((current) => current === row.city ? null : row.city)}
                  className={`cursor-pointer hover:bg-gray-50 ${selectedCity === row.city ? "bg-primary/5" : ""}`}>
                  <th scope="row" className="px-5 py-3 text-left font-medium text-gray-700">
                    <button type="button" aria-expanded={selectedCity === row.city} aria-controls={`city-reuse-${index}`}
                      className="flex cursor-pointer items-center gap-2 rounded text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
                      <span aria-hidden="true" className={`text-xs transition-transform ${selectedCity === row.city ? "rotate-90" : ""}`}>▶</span>{row.city}
                    </button>
                  </th>
                  {[row.buildings, row.apartments, row.other].map((value, index) => <td key={index} className="px-5 py-3 text-right tabular-nums text-gray-900">{fmtNum(value)}</td>)}
                </tr>
                {selectedCity === row.city && <tr id={`city-reuse-${index}`}><td colSpan={4} className="bg-gray-50">
                  <AdminCadastruAddressReuse key={`${row.city}:${reuseRefresh}`} city={row.city} />
                </td></tr>}
              </Fragment>)}
              {!cityStats.byCity.length && <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-500">No cadastru data stored yet.</td></tr>}
            </tbody>
          </table>
        </div> : <p role={cityStats && !citiesLoading ? "alert" : "status"} className="px-5 py-4 text-sm text-gray-500 sm:px-6">
          {citiesLoading ? "Loading stored data by city…" : cityStats ? "City statistics are temporarily unavailable. Try again." : "Load the city breakdown when needed."}
        </p>}
      </section>
      <p className="text-xs text-gray-500">All-time database inventory, including expired records. Buildings appearing in multiple tables are counted once.</p>

      <AdminCadastruOfflineSearch />
    </div>
  );
}

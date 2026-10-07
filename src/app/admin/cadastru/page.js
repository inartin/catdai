"use client";

import { useCallback, useEffect, useState } from "react";

function fmtNum(value) {
  return Number(value).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
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

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cadastru</h1>
          <p className="mt-1 text-sm text-gray-500">All stored records, including expired snapshots.</p>
        </div>
        <button
          type="button"
          onClick={() => loadStats(true)}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:border-primary/40 hover:text-primary disabled:text-gray-400 disabled:hover:border-gray-200 transition-colors"
        >
          {loading ? "Refreshing..." : "Hard refresh"}
        </button>
      </div>

      <section className="space-y-3" aria-labelledby="cadastru-storage-heading">
        <h2 id="cadastru-storage-heading" className="text-lg font-semibold text-gray-900">Stored Cadastru Data</h2>
        {loading && !stats ? (
          <p className="text-sm text-gray-500">Loading stored cadastru data...</p>
        ) : stats?.available ? (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <p className="text-sm font-medium text-gray-600">Total stored cadastral numbers</p>
              <p className="mt-3 text-3xl font-bold tabular-nums text-gray-900">{fmtNum(stats.total)}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white md:col-span-2">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left font-semibold">City</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Stored cadastral numbers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.byCity.map((row) => (
                    <tr key={row.city}>
                      <td className="px-5 py-3 text-gray-700">{row.city}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-gray-900">{fmtNum(row.count)}</td>
                    </tr>
                  ))}
                  {stats.byCity.length === 0 && (
                    <tr><td colSpan={2} className="px-5 py-6 text-center text-gray-500">No cadastru data stored yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Stored cadastru statistics are temporarily unavailable.</p>
        )}
      </section>
    </div>
  );
}

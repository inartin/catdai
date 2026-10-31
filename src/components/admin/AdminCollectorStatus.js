"use client";

import { useEffect, useState } from "react";

const labels = { cadastru: "Cadastral data", transport: "Public transport", nearby: "Nearby places", reports: "Municipal reports" };
const fmt = value => Number(value).toLocaleString("ro-RO");

export default function AdminCollectorStatus({ refreshKey = 0 }) {
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      setChecking(true);
      try {
        const response = await fetch("/api/admin/collector-status", {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
        });
        if (!response.ok) throw new Error("unavailable");
        const data = await response.json();
        if (!data.available) throw new Error("unavailable");
        if (!controller.signal.aborted) { setResult(data); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setChecking(false);
      }
    }
    load();
    const visibleLoad = () => { if (document.visibilityState === "visible") load(); };
    const timer = setInterval(visibleLoad, 10_000);
    document.addEventListener("visibilitychange", visibleLoad);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visibleLoad); };
  }, [refreshKey, refresh]);

  return (
    <section aria-labelledby="collection-heading" className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="collection-heading" className="text-lg font-semibold text-gray-900">Building collection</h2>
            {result && !error && <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${result.state === "running" ? "text-emerald-700" : "text-gray-500"}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${result.state === "running" ? "animate-pulse bg-emerald-500" : "bg-gray-400"}`} />
              {result.state === "running" ? "Running" : result.state === "stopped" ? "Stopped" : "Run status unknown"}
            </span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">Live collector progress · updates every 10 seconds</p>
        </div>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={checking}
          className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:text-primary disabled:cursor-default disabled:text-gray-400">
          {checking ? "Updating…" : "Refresh"}
        </button>
      </div>
      {error && <p role="alert" className="border-b border-gray-100 px-5 py-3 text-sm text-amber-800 sm:px-6">
        Collector status is unavailable.{result ? " Showing the last received statistics." : " Try Refresh."}
      </p>}
      {!result ? !error && <p role="status" className="p-5 text-sm text-gray-500 sm:p-6">Loading live collector statistics…</p> : (
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
            <p><strong className="font-semibold tabular-nums text-gray-900">{fmt(result.totals.processed)}</strong> processed of <strong className="font-semibold tabular-nums text-gray-900">{fmt(result.totals.total)}</strong> addresses</p>
            <p className="text-xs">{result.worker} · Checkpoint {new Date(result.updatedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
          </div>
          {result.addressProgress ? <>
            <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["complete", "Complete", "All four datasets saved", "text-primary"],
                ["retry", "Needs retry", "Some data saved; finished attempt left gaps", "text-amber-800"],
                ["working", "Partly saved / queued", "Some data saved; work remains", "text-gray-900"],
                ["empty", "No data saved", "Nothing saved yet, including failed empty attempts", "text-gray-900"],
              ].map(([key, label, description, color]) => <div key={key} className="rounded-lg bg-gray-50 p-4">
                <dt className="text-sm text-gray-600">{label}</dt>
                <dd className={`mt-2 text-2xl font-semibold tabular-nums ${color}`}>{fmt(result.addressProgress[key])}</dd>
                <p className="mt-1 text-xs text-gray-500">{description}</p>
              </div>)}
            </dl>
            <p className="text-xs text-gray-500">Each known address is counted once. No data saved can include failed attempts that need a retry.</p>
          </> : <p className="text-sm text-amber-800">Update the collector API worker to show the four address groups.</p>}
          <button type="button" onClick={() => setShowRetry(value => !value)} aria-expanded={showRetry} aria-controls="collector-retry" className="cursor-pointer text-xs font-medium text-primary hover:underline">{showRetry ? "Hide missing data" : "See what is missing"}</button>
          <div className="rounded-lg border border-gray-100 p-4">
            <p className="text-xs font-medium text-gray-500">{result.state === "running" ? "Currently collecting" : "Collector activity"}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{result.state === "running" ? result.current?.address || "Checking the queue…" : result.state === "stopped" ? "Collector is stopped" : "Current activity unavailable"}</p>
            {result.current && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(labels).filter(([key]) => result.current.categories[key] !== "not_applicable").map(([key, label]) => <span key={key} className={`rounded px-2 py-1 text-xs ${result.current.categories[key] === "complete" ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"}`}>{result.current.categories[key] === "complete" ? "✅" : "⏳"} {label}</span>)}</div>}
            {result.lastEvent && <p className="mt-2 break-words text-xs leading-5 text-gray-500">Last activity: {result.lastEvent}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(labels).map(([key, label]) => <div key={key} className="text-sm">
            <p className="font-medium text-gray-700">{label}</p><p className="mt-1 text-xs tabular-nums text-gray-500">{fmt(result.categories[key].saved)} saved · {fmt(result.categories[key].missing)} missing in partial addresses</p>
          </div>)}</div>
          {showRetry && <div id="collector-retry" className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-500"><tr><th className="px-4 py-3 font-medium">Address</th><th className="px-4 py-3 font-medium">Missing data / last failure</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{result.retry.map(job => <tr key={job.id}><th scope="row" className="px-4 py-3 align-top font-medium text-gray-700">{job.address}</th><td className="px-4 py-3 text-xs leading-5 text-gray-500">{job.missing.map(item => <p key={item.category}><span className="font-medium text-gray-700">{labels[item.category]}:</span> {item.error}</p>)}</td></tr>)}</tbody>
            </table>
            {!result.retry.length && <p className="p-4 text-sm text-gray-500">No partial addresses.</p>}
            {result.totals.partial > result.retry.length && <p className="border-t border-gray-100 p-4 text-xs text-gray-500">Showing the first {fmt(result.retry.length)} of {fmt(result.totals.partial)} partial addresses.</p>}
          </div>}
        </div>
      )}
    </section>
  );
}

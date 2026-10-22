"use client";

import { useEffect, useState } from "react";

const WORKER_NAMES = ["pi", "mac", "curiosity"];
const STATES = {
  online: { label: "Online", dot: "bg-emerald-500", text: "text-emerald-700" },
  offline: { label: "Offline", dot: "bg-red-500", text: "text-red-600" },
  not_configured: { label: "Not configured", dot: "bg-amber-500", text: "text-amber-800" },
  unknown: { label: "Check failed", dot: "bg-amber-500", text: "text-amber-800" },
};

export default function AdminWorkerStatus() {
  const [checkId, setCheckId] = useState(0);
  const [result, setResult] = useState(null);
  const checking = result?.checkId !== checkId;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/worker-status", {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Session expired" : "Could not check status");
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ ...data, checkId });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({
          detail: error.message || "Could not check status",
          checkedAt: new Date().toISOString(), checkId,
        });
      });
    return () => controller.abort();
  }, [checkId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setCheckId((value) => value + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section aria-label="API worker status" className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-sm font-medium text-gray-900">API workers</h2>
        {!checking && result?.checkedAt && (
          <time dateTime={result.checkedAt} className="text-xs text-gray-400">
            Checked {new Date(result.checkedAt).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })}
          </time>
        )}
        <button type="button" onClick={() => setCheckId((value) => value + 1)} disabled={checking}
          className="ml-auto cursor-pointer rounded-md border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-default disabled:opacity-50">
          {checking ? "Checking…" : "Check now"}
        </button>
      </div>
      <div role="status" aria-live="polite" className="grid gap-3 sm:grid-cols-3">
        {WORKER_NAMES.map((name) => {
          const worker = result?.workers?.find((item) => item.name === name);
          const state = checking ? { label: "Checking…", dot: "bg-gray-400", text: "text-gray-500" }
            : STATES[worker?.status] || STATES.unknown;
          const version = worker?.appVersion;
          const shortVersion = version && /^[a-f0-9]{40,64}/.test(version)
            ? `${version.slice(0, 8)}${version.endsWith("-dirty") ? "-dirty" : ""}` : version;
          return (
            <div key={name} className="min-w-0 rounded-md border border-gray-100 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-gray-900">{name}</span>
                <span className={`inline-flex items-center gap-1.5 font-medium ${state.text}`}>
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${state.dot}`} />{state.label}
                </span>
                {!checking && worker?.status === "online" && <span className="text-xs text-gray-500">{worker.responseTimeMs} ms</span>}
              </div>
              {!checking && (worker?.detail || result?.detail) && <p className="mt-1 text-xs text-gray-500">{worker?.detail || result.detail}</p>}
              {!checking && worker?.status === "online" && (
                <p className="mt-1 break-words text-xs text-gray-500" title={version || undefined}>
                  {worker.nodeName && worker.nodeName !== name && <span>Responding as {worker.nodeName} · </span>}
                  App {shortVersion || "unknown"} · Node {worker.nodeVersion || "unknown"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

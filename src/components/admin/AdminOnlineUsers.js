"use client";

import { useEffect, useState } from "react";

export default function AdminOnlineUsers() {
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function refresh() {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/online-users", {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error("Unavailable");
        const text = await response.text();
        const count = Number(text);
        if (!/^\d+$/.test(text) || !Number.isSafeInteger(count)) throw new Error("Invalid count");
        if (!controller.signal.aborted) setResult({ count });
      } catch {
        if (!controller.signal.aborted) setResult({ error: true });
      } finally {
        inFlight = false;
      }
    }

    refresh();
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" aria-label="Online users"
      title="Unique browsers seen across CatDai in the last 90 seconds. Updates every 30 seconds."
      className="flex w-full items-center justify-center gap-2 whitespace-nowrap text-sm text-gray-500 lg:w-auto lg:flex-1">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${result?.error ? "bg-amber-500" : result ? "bg-emerald-500" : "bg-gray-300"}`} />
      <span>Online now: <strong className={result?.error ? "font-medium text-amber-700" : "font-semibold text-gray-900"}>
        {result?.error ? "Unavailable" : result ? result.count.toLocaleString("ro-RO") : "—"}
      </strong></span>
    </div>
  );
}

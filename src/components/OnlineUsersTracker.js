"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { fetchWithStatisticsAuth } from "@/lib/statistics-client";
import { getDeviceId } from "@/lib/visitor-browser";

export default function OnlineUsersTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (process.env.NODE_ENV === "development" && /^\/(?:ro\/|ru\/)?cadastru(?:\/|$)/.test(pathname)) return;

    const controller = new AbortController();
    let inFlight = false;
    async function heartbeat() {
      if (document.visibilityState !== "visible" || inFlight || !getDeviceId()) return;
      inFlight = true;
      try {
        await fetchWithStatisticsAuth("/api/online-users", {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
      } catch {
        // Presence must not interrupt the page; the next heartbeat retries.
      } finally {
        inFlight = false;
      }
    }

    heartbeat();
    const timer = setInterval(heartbeat, 30_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [pathname]);

  return null;
}

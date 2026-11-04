"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getDeviceId, getActiveAdSource, trackAdSourceEvent } from "@/lib/tracking";
import { getAdSourceFromParams } from "@/lib/ad-sources";

function getCurrentPath() {
  return window.location.pathname + window.location.search;
}

export default function AdSourceTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname.startsWith("/admin")) return;
    if (process.env.NODE_ENV === "development" && /^\/(?:ro\/|ru\/|en\/)?cadastru(?:\/|$)/.test(window.location.pathname)) return;

    getDeviceId();
    const currentPath = getCurrentPath();
    if (lastTrackedPathRef.current === currentPath) return;
    const params = new URLSearchParams(window.location.search);
    const landingSource = getAdSourceFromParams(params);

    if (landingSource) {
      getActiveAdSource();
      trackAdSourceEvent("source_landing_visit");
      lastTrackedPathRef.current = currentPath;
      return;
    }

    if (!getActiveAdSource()) return;

    lastTrackedPathRef.current = currentPath;
    trackAdSourceEvent("page_view", {
      title: document.title || null,
    });
  }, [pathname, searchParams]);

  return null;
}

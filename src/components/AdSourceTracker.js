"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { captureAdSource, getActiveAdSource, trackAdSourceEvent } from "@/lib/tracking";

function getCurrentPath() {
  return window.location.pathname + window.location.search;
}

export default function AdSourceTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentPath = getCurrentPath();
    const params = new URLSearchParams(window.location.search);

    if (window.location.pathname === "/" && params.get("src") === "zdg") {
      captureAdSource("zdg", {
        landing_path: currentPath,
        referrer: document.referrer || null,
      });
      trackAdSourceEvent("source_landing_visit");
    }

    if (!getActiveAdSource()) return;
    if (lastTrackedPathRef.current === currentPath) return;

    lastTrackedPathRef.current = currentPath;
    trackAdSourceEvent("page_view", {
      title: document.title || null,
    });
  }, [pathname]);

  return null;
}

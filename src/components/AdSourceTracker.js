"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { captureAdSource, getActiveAdSource, trackAdSourceEvent } from "@/lib/tracking";

function getCurrentPath() {
  return window.location.pathname + window.location.search;
}

const LANDING_SOURCE_RULES = [
  { source: "zdg", param: "src", value: "zdg" },
  { source: "reddit", param: "utm_source", value: "reddit" },
];

function getLandingAdSource(params) {
  for (const rule of LANDING_SOURCE_RULES) {
    if ((params.get(rule.param) || "").toLowerCase() === rule.value) {
      return rule.source;
    }
  }
  return null;
}

export default function AdSourceTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentPath = getCurrentPath();
    const params = new URLSearchParams(window.location.search);
    const landingSource = window.location.pathname === "/" ? getLandingAdSource(params) : null;

    if (landingSource) {
      captureAdSource(landingSource, {
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

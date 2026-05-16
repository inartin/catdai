"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "catdai_market_trends";
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.cached_at || !parsed?.data) return null;

    const age = Date.now() - new Date(parsed.cached_at).getTime();
    if (age < TWELVE_HOURS_MS) return parsed.data;

    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cached_at: new Date().toISOString(),
      data,
    }));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function useMarketTrends() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;

      const cached = readCache();
      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      fetch("/api/market-trends")
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((json) => {
          if (cancelled) return;
          writeCache(json);
          setData(json);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error("useMarketTrends:", err.message);
          setError(err);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}

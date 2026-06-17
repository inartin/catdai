"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "catdai_live_prices";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Read cached price data from localStorage.
 * Returns { data, fresh } where `fresh` is true if < 24h old.
 * Never deletes stale data — it serves as a last-resort fallback.
 */
function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.updated_at) return null;

    const age = Date.now() - new Date(parsed.updated_at).getTime();
    return { data: parsed, fresh: age < TWENTY_FOUR_HOURS_MS };
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — ignore
  }
}

export function useLivePrices() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cached = readCache();

    if (cached?.data) {
      setData(cached.data);
      setLoading(false);
    }

    let cancelled = false;

    fetch("/api/prices", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        // Only update if we got valid data (not an error response)
        if (json && !json.error) {
          writeCache(json);
          setData(json);
        } else if (!cached?.data) {
          // API returned an error shape and we have no stale data
          setError(new Error(json?.error || "Invalid price data"));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("useLivePrices:", err.message);
        // Only set error if we have no stale data to fall back on
        if (!cached?.data) {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}

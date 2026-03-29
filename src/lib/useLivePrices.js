"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "catdai_live_prices";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.updated_at) return null;

    const age = Date.now() - new Date(parsed.updated_at).getTime();
    if (age < TWENTY_FOUR_HOURS_MS) return parsed;

    // Cache expired, remove it proactively
    localStorage.removeItem(STORAGE_KEY);
    return null;
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
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch("/api/prices")
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
        console.error("useLivePrices:", err.message);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}

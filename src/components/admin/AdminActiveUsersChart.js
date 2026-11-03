"use client";

import { useEffect, useRef, useState } from "react";
import ActiveUsersChart from "@/components/ActiveUsersChart";
import { ADMIN_PERIOD_OPTIONS, chisinauDateKey } from "@/lib/admin-periods";

const CACHE_TTL_MS = 5 * 60 * 1000;

function cachedReport(cache, period) {
  const entry = cache.get(period);
  return entry && Date.now() < entry.expiresAt && entry.date === chisinauDateKey(new Date())
    ? entry.data : null;
}

export default function AdminActiveUsersChart({ initialPeriod = "day" }) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const freshRef = useRef(false);
  const reportsRef = useRef(new Map());

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ period });
    const fresh = freshRef.current;
    freshRef.current = false;
    if (!fresh && cachedReport(reportsRef.current, period)) return;
    if (fresh) params.set("fresh", "1");
    fetch(`/api/admin/active-users?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        const updatedAt = result.updatedAt ? Date.parse(result.updatedAt) : Date.now();
        reportsRef.current.set(period, {
          data: result, expiresAt: updatedAt + CACHE_TTL_MS,
          date: chisinauDateKey(updatedAt),
        });
        setData(result);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [period, refreshVersion]);

  // Keep the last chart and its labels in place until an uncached period arrives.
  const displayedPeriod = data?.period || period;
  return (
    <ActiveUsersChart
      data={data?.dailyActiveUsers || []}
      type={displayedPeriod === "day" ? "hourly" : "daily"}
      period={period}
      periodLabel={ADMIN_PERIOD_OPTIONS.find((option) => option.key === displayedPeriod)?.label}
      onPeriodChange={(next) => {
        if (next === period) return;
        const cached = cachedReport(reportsRef.current, next);
        if (cached) setData(cached);
        setLoading(!cached);
        setError(null);
        setPeriod(next);
      }}
      totalActive={data?.activeUsers}
      newUsersTotal={data?.newUsers}
      oldUsersTotal={data?.oldUsers}
      loading={loading}
      error={error}
      onRefresh={() => {
        freshRef.current = true;
        setLoading(true);
        setError(null);
        setRefreshVersion((version) => version + 1);
      }}
    />
  );
}

"use client";

import { useMemo, useState } from "react";

const PERIOD_BUTTONS = [
  { key: "day", label: "1 day" },
  { key: "week", label: "7 days" },
  { key: "month", label: "This month" },
  { key: "previous_month", label: "Previous month" },
  { key: "all", label: "All time" },
];

function formatPointLabel(dateStr, type) {
  if (!dateStr) return "-";
  if (type === "hourly") {
    return dateStr;
  }
  // dateStr is YYYY-MM-DD
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("ro-RO", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr, type) {
  if (!dateStr) return "-";
  if (type === "hourly") {
    const nextHour = (parseInt(dateStr.split(":")[0], 10) + 1).toString().padStart(2, "0") + ":00";
    return `Today at ${dateStr} - ${nextHour}`;
  }
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toLocaleDateString("ro-RO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ActiveUsersChart({
  data = [],
  type = "daily",
  period = "week",
  periodLabel = "",
  onPeriodChange,
  totalActive,
  newUsersTotal,
  oldUsersTotal,
  loading = false,
  error = null,
  onRefresh,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const points = useMemo(() => {
    return Array.isArray(data) ? data : [];
  }, [data]);

  // Dimensions
  const width = 840;
  const height = 260;
  const padding = { top: 24, right: 32, bottom: 44, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const bottomY = height - padding.bottom;

  // Statistics
  const { maxVal, peakPoint, avgVal, totalPeriodUsers } = useMemo(() => {
    if (points.length === 0) return { maxVal: 1, peakPoint: null, avgVal: 0, totalPeriodUsers: 0 };
    let max = 0;
    let peak = points[0];
    let sum = 0;
    for (const p of points) {
      const val = Number(p.activeUsers || 0);
      sum += val;
      if (val >= max) {
        max = val;
        peak = p;
      }
    }
    const avg = (sum / points.length).toFixed(1);
    return { maxVal: Math.max(max, 1), peakPoint: peak, avgVal: avg, totalPeriodUsers: sum };
  }, [points]);

  // Nice Y-axis ceiling
  const yMax = useMemo(() => {
    if (maxVal <= 4) return 4;
    if (maxVal <= 8) return 8;
    if (maxVal <= 15) return 16;
    if (maxVal <= 30) return 32;
    if (maxVal <= 50) return 50;
    if (maxVal <= 100) return 100;
    return Math.ceil((maxVal * 1.15) / 10) * 10;
  }, [maxVal]);

  const yTicks = useMemo(() => {
    return [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax];
  }, [yMax]);

  // Compute coordinates for each point
  const plottedPoints = useMemo(() => {
    if (points.length === 0) return [];
    const count = points.length;
    return points.map((p, index) => {
      const x = count === 1
        ? padding.left + chartWidth / 2
        : padding.left + (index / (count - 1)) * chartWidth;
      const y = bottomY - ((Number(p.activeUsers || 0)) / yMax) * chartHeight;
      const regCount = (Number(p.newUsers || 0) + Number(p.oldUsers || 0));
      const yReg = bottomY - (regCount / yMax) * chartHeight;
      const anonCount = Number(p.anonymousUsers || 0);
      const yAnon = bottomY - (anonCount / yMax) * chartHeight;
      return {
        ...p,
        x,
        y,
        yReg,
        yAnon,
        regCount,
        anonCount,
        index,
      };
    });
  }, [points, chartWidth, chartHeight, bottomY, yMax, padding.left]);

  // SVG paths
  const { linePath, areaPath, regLinePath } = useMemo(() => {
    if (plottedPoints.length === 0) return { linePath: "", areaPath: "", regLinePath: "" };
    if (plottedPoints.length === 1) {
      const p = plottedPoints[0];
      return {
        linePath: `M ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y}`,
        areaPath: `M ${p.x - 20} ${bottomY} L ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y} L ${p.x + 20} ${bottomY} Z`,
        regLinePath: `M ${p.x - 20} ${p.yReg} L ${p.x + 20} ${p.yReg}`,
      };
    }
    const line = plottedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L ${plottedPoints[plottedPoints.length - 1].x.toFixed(1)} ${bottomY} L ${plottedPoints[0].x.toFixed(1)} ${bottomY} Z`;
    const regLine = plottedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.yReg.toFixed(1)}`).join(" ");
    return { linePath: line, areaPath: area, regLinePath: regLine };
  }, [plottedPoints, bottomY]);

  // X-axis label stride to prevent overlapping
  const stride = useMemo(() => {
    const len = plottedPoints.length;
    if (len <= 10) return 1;
    if (len <= 18) return 2;
    if (len <= 28) return 3;
    if (len <= 45) return 5;
    return Math.ceil(len / 10);
  }, [plottedPoints.length]);

  const activePoint = hoveredIndex != null ? plottedPoints[hoveredIndex] : null;
  const hasData = totalActive != null || points.length > 0;

  return (
    <div className="w-full" aria-busy={loading}>
      {/* Chart Toolbar & Metric Cards */}
      <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Active Users Trend
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
              {type === "hourly"
                ? "Hourly active visitors & registered users today"
                : `Daily active users (${periodLabel || "selected period"})`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {onPeriodChange && (
              <div className="inline-flex items-center rounded-lg bg-gray-200/70 p-1 dark:bg-slate-800">
                {PERIOD_BUTTONS.map((btn) => (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => onPeriodChange(btn.key)}
                    className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      period === btn.key
                        ? "bg-white text-gray-900 shadow-xs dark:bg-slate-700 dark:text-slate-100"
                        : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
            {onRefresh && (
              <button type="button" onClick={onRefresh} disabled={loading}
                className="w-16 cursor-pointer text-right text-xs text-primary hover:underline disabled:text-gray-400">
                {loading ? "Updating…" : error ? "Retry" : "Refresh"}
              </button>
            )}
          </div>
        </div>

        {/* Quick Highlights Row */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-lg border border-gray-200/60 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide dark:text-slate-400">
              {type === "hourly" ? "Period Total" : "Period Total"}
            </span>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-slate-100">
              {totalActive != null ? totalActive.toLocaleString() : hasData ? totalPeriodUsers.toLocaleString() : "—"}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200/60 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide dark:text-slate-400">
              {type === "hourly" ? "Hourly Average" : "Daily Average"}
            </span>
            <p className="mt-0.5 text-lg font-bold text-indigo-600 dark:text-indigo-400">
              {hasData ? avgVal : "—"}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200/60 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide dark:text-slate-400">
              Peak {type === "hourly" ? "Hour" : "Day"}
            </span>
            <p className="mt-0.5 truncate text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {peakPoint ? `${peakPoint.activeUsers} (${formatPointLabel(peakPoint.date, type)})` : "-"}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200/60 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide dark:text-slate-400">
              Reg. Users (New / Old)
            </span>
            <p className="mt-0.5 text-lg font-bold text-gray-900 dark:text-slate-100">
              {newUsersTotal != null || oldUsersTotal != null
                ? `${newUsersTotal ?? 0} / ${oldUsersTotal ?? 0}`
                : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* SVG Chart Section */}
      <div className="relative p-5">
        {error && (
          <div role="alert" className="absolute inset-x-5 top-1 z-10 rounded bg-white/95 px-3 py-2 text-center text-sm text-red-600 dark:bg-slate-900/95">
            {hasData ? "Update failed. Showing the last loaded chart. Please retry." : "Active-user chart is unavailable. Please retry."}
          </div>
        )}
        {plottedPoints.length === 0 && !error && (
          <div role="status" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">
            {loading ? "Loading activity chart…" : "No activity points found for this period."}
          </div>
        )}
        <div className="relative">
          {/* Legend & Hover Status Header */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                Total Active Users
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full border border-emerald-500 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-950" />
                Registered
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-gray-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full border border-violet-500 bg-violet-100 dark:border-violet-400 dark:bg-violet-950" />
                Anonymous
              </span>
            </div>

            {activePoint && (
              <div className="font-medium text-indigo-700 dark:text-indigo-300">
                {formatFullDate(activePoint.date, type)}:{" "}
                <strong>{activePoint.activeUsers} active</strong>{" "}
                <span className="text-gray-400">
                  ({activePoint.regCount} registered, {activePoint.anonCount} anonymous)
                </span>
              </div>
            )}
          </div>

          {/* SVG Render */}
          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Active users trend chart"
              className="w-full min-w-[620px] select-none"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                <linearGradient id="activeUsersGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.28" />
                  <stop offset="90%" stopColor="#4f46e5" stopOpacity="0.01" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Y-axis grid lines and labels */}
              {yTicks.map((tick) => {
                const y = bottomY - (tick / yMax) * chartHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                      className="dark:stroke-slate-800"
                    />
                    <text
                      x={padding.left - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-gray-400 text-[10px] font-medium dark:fill-slate-500"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {/* Area under curve */}
              {areaPath && (
                <path d={areaPath} fill="url(#activeUsersGradient)" pointerEvents="none" />
              )}

              {/* Secondary line: Registered users */}
              {regLinePath && plottedPoints.some((p) => p.regCount > 0) && (
                <path
                  d={regLinePath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  pointerEvents="none"
                  opacity="0.85"
                />
              )}

              {/* Main line: Total active users */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                  className="dark:stroke-indigo-400"
                />
              )}

              {/* Hover vertical crosshair */}
              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={padding.top}
                  x2={activePoint.x}
                  y2={bottomY}
                  stroke="#6366f1"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              )}

              {/* X-axis ticks & date labels */}
              {plottedPoints.map((p, i) => {
                const isVisible =
                  i === 0 ||
                  i === plottedPoints.length - 1 ||
                  i % stride === 0;

                return (
                  <g key={`x-tick-${p.date || i}`}>
                    {isVisible && (
                      <>
                        <line
                          x1={p.x}
                          y1={bottomY}
                          x2={p.x}
                          y2={bottomY + 5}
                          stroke="#cbd5e1"
                          strokeWidth="1"
                          className="dark:stroke-slate-700"
                        />
                        <text
                          x={p.x}
                          y={bottomY + 18}
                          textAnchor="middle"
                          className="fill-gray-500 text-[10px] font-medium dark:fill-slate-400"
                        >
                          {formatPointLabel(p.date, type)}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* Points & Interactive Hit Targets */}
              {plottedPoints.map((p, i) => {
                const isHovered = hoveredIndex === i;
                return (
                  <g key={`point-${p.date || i}`}>
                    {/* Registered user small dot if different from total */}
                    {p.regCount > 0 && p.regCount !== p.activeUsers && (
                      <circle
                        cx={p.x}
                        cy={p.yReg}
                        r={isHovered ? 4 : 2.5}
                        fill="#10b981"
                        stroke="#ffffff"
                        strokeWidth="1"
                        pointerEvents="none"
                      />
                    )}

                    {/* Main active users point dot */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 5.5 : 3.5}
                      fill="#4f46e5"
                      stroke="#ffffff"
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      pointerEvents="none"
                      className="transition-all duration-150 dark:stroke-slate-900"
                    />

                    {/* Broad invisible hit area for easy hover / tap */}
                    <rect
                      x={
                        plottedPoints.length === 1
                          ? padding.left
                          : i === 0
                          ? padding.left
                          : p.x - (chartWidth / (plottedPoints.length - 1)) / 2
                      }
                      y={padding.top}
                      width={
                        plottedPoints.length === 1
                          ? chartWidth
                          : chartWidth / (plottedPoints.length - 1)
                      }
                      height={chartHeight + padding.bottom}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(i)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Floating Tooltip Card */}
          {activePoint && (
            <div
              className="pointer-events-none absolute z-20 w-52 rounded-xl border border-gray-200/80 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-xs dark:border-slate-700 dark:bg-slate-800/95"
              style={{
                left: Math.min(
                  Math.max(activePoint.x - 104, 10),
                  width - 220
                ),
                top: Math.max(activePoint.y - 120, 10),
              }}
            >
              <p className="font-semibold text-gray-900 dark:text-slate-100">
                {formatFullDate(activePoint.date, type)}
              </p>

              <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                    Total Active:
                  </span>
                  <strong className="font-bold text-gray-900 dark:text-slate-100">
                    {activePoint.activeUsers}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Registered:
                  </span>
                  <strong className="font-medium text-gray-800 dark:text-slate-200">
                    {activePoint.regCount}
                    <span className="text-[10px] text-gray-400 font-normal ml-1">
                      ({activePoint.newUsers} new, {activePoint.oldUsers} old)
                    </span>
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />
                    Anonymous:
                  </span>
                  <strong className="font-medium text-gray-800 dark:text-slate-200">
                    {activePoint.anonCount}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

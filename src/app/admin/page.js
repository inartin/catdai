"use client";

import AdminUserCell, { VisitorTags } from "@/components/admin/AdminUserCell";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
import { groupExternalApiEvents } from "@/lib/admin-external-api-groups";
import AdminUserCredits from "@/components/AdminUserCredits";
import ProfileTransactionsTable from "@/components/ProfileTransactionsTable";
import AdminWorkerStatus from "@/components/admin/AdminWorkerStatus";
import AdminOnlineUsers from "@/components/admin/AdminOnlineUsers";

function fmtNum(n) {
  if (n == null) return "\u2014";
  return Number(n).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

function fmtPrice(amount, currency) {
  if (amount == null) return "\u2014";
  return `${fmtNum(amount)} ${currency || "\u20AC"}`;
}

function fmtPct(value) {
  if (value == null) return "\u2014";
  return `${Number(value).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
}

function fmtYears(value) {
  if (value == null) return "\u2014";
  return `${Number(value).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} years`;
}

function fmtDateTime(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtBool(value) {
  return value ? "Yes" : "No";
}

function fmtUserPackage(packageKey) {
  if (packageKey === "free") return "Start";
  if (packageKey === "standard_pack") return "Standard";
  if (packageKey === "pro_pack") return "Pro";
  if (packageKey === "extra_pack") return "Extra";
  return "Start";
}

function userPackageClassName(user) {
  if (user?.packageKey === "extra_pack") {
    return "bg-purple-100 text-purple-800 ring-purple-200";
  }
  if (user?.packageKey === "pro_pack") {
    return "bg-cyan-100 text-cyan-800 ring-cyan-200";
  }
  if (user?.packageKey === "standard_pack") {
    return "bg-green-100 text-green-800 ring-green-200";
  }
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

const USER_PACKAGE_OPTIONS = [
  { key: "free", label: "Start" },
  { key: "standard_pack", label: "Standard" },
  { key: "pro_pack", label: "Pro" },
  { key: "extra_pack", label: "Extra" },
];

const PAYMENT_PRODUCT_LABELS_RO = {
  standard_pack: "Pachet Standard",
  pro_pack: "Pachet Pro",
  extra_pack: "Pachet Extra",
  sale_estimate_single: "Evaluare completă",
  rent_estimate_single: "Evaluare chirie completă",
  listing_analysis_single: "Analiză anunț 999",
  cadastru_lookup_single: "Date cadastrale",
  yield_calculator_single: "Calculator randament",
  pdf_report_single: "Raport PDF",
};

const PAYMENT_STATUS_LABELS_RO = {
  pending: "În așteptare",
  registered: "În procesare",
  checkout_closed: "Checkout închis",
  paid: "Achitat",
  refund_pending: "Rambursare în așteptare",
  refunded: "Rambursat",
  partially_refunded: "Rambursat parțial",
  creation_unknown: "În curs de verificare",
  expired: "Expirat",
  chargeback: "Chargeback",
  canceled: "Anulat",
  payment_failed: "Eșuat",
  failed: "Eșuat",
};

const DASHBOARD_PERIOD_OPTIONS = [
  { key: "day", label: "1 day" },
  { key: "week", label: "7 days" },
  { key: "month", label: "1 month" },
  { key: "all", label: "All time" },
];

const EXTERNAL_API_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "failure", label: "Failed" },
  { key: "success", label: "Successful" },
];

function fmtCadastruSearchType(type) {
  if (type === "address") return "Address";
  if (type === "number") return "Cadastral number";
  return type || "\u2014";
}

function fmtCadastruResultSummary(byResultType) {
  const counts = byResultType || {};
  const parts = [
    ["full_data", "full"],
    ["apartment_only", "apartment"],
    ["land_only", "land"],
    ["address_only", "address"],
    ["no_data", "none"],
    ["error", "failed"],
  ]
    .map(([key, label]) => counts[key] ? `${fmtNum(counts[key])} ${label}` : null)
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "No result data yet";
}

function fmtCadastruSourceSummary(byLookupSource) {
  const counts = byLookupSource || {};
  const parts = [
    ["api", "API"],
    ["cache", "cached"],
    ["local", "local"],
  ]
    .map(([key, label]) => counts[key] ? `${fmtNum(counts[key])} ${label}` : null)
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "No source data yet";
}

function fmtListingLinkStatus(status) {
  if (status === "success") return "Analyzed";
  if (status === "unsupported_listing_type") return "Rejected type";
  if (status === "not_chisinau") return "Outside Chișinău";
  if (status === "insufficient_data") return "Insufficient data";
  if (status === "not_a_listing") return "Not a listing";
  if (status === "fetch_failed") return "Fetch failed";
  if (status === "upstream_blocked") return "Upstream blocked";
  return status || "\u2014";
}

function fmtListingLinkProperty(row) {
  return [
    row.rooms_count ? `${row.rooms_count} rooms` : null,
    row.district,
    row.city,
  ].filter(Boolean).join(" · ") || "\u2014";
}

function fmtCalculatorProperty(row) {
  return [
    row.rooms_count ? `${row.rooms_count} rooms` : null,
    row.area_m2 ? `${fmtNum(row.area_m2)} m\u00B2` : null,
    row.district,
    row.city,
  ].filter(Boolean).join(" · ") || "\u2014";
}

function fmtTopDistricts(byDistrict) {
  const entries = Object.entries(byDistrict || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (!entries.length) return "No district data yet";
  return entries.map(([district, count]) => `${district}: ${fmtNum(count)}`).join(" · ");
}

function fmtExternalApiUsageSummary(usage) {
  if (!usage?.total) return "No external calls yet";
  const byService = usage.byService || {};
  const listing999 = byService["999_listing"]?.total || 0;
  const cadastru = (byService.cadastru_number?.total || 0) + (byService.cadastru_address?.total || 0);
  const nearby = byService.cadastru_nearby?.total || 0;
  return `999 ${fmtNum(listing999)} / cadastru ${fmtNum(cadastru)} / nearby ${fmtNum(nearby)} · ${fmtNum(usage.failure)} failed`;
}

function fmtPaymentAmount(amountMinor, currencyCode) {
  if (amountMinor == null) return "\u2014";
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: currencyCode || "MDL",
  }).format(amountMinor / 100);
}

function fmtCheckoutSummary(item) {
  const count = item?.uniqueVisitors || 0;
  return (
    <span>
      <strong className="font-semibold text-gray-900 dark:text-slate-100">{fmtNum(count)}</strong>{" "}
      {count === 1 ? "user" : "users"}
    </span>
  );
}

function fmtExternalApiService(service, endpoint = "") {
  if (endpoint.includes("/municipal-reports")) return "Municipal reports";
  if (endpoint.includes("/public-transport")) return "Public transport";
  if (service === "999_listing") return "999 listing";
  if (service === "cadastru_number") return "Cadastru number";
  if (service === "cadastru_address") return "Cadastru address";
  if (service === "cadastru_nearby") return "Nearby places";
  return service || "\u2014";
}

function fmtExternalApiNodes(rows) {
  return [...new Set(rows.map((row) => row.response_headers?.["x-catdai-node"]
    || row.response_headers?.["x-catdai-target-node"] || "Not recorded"))].join(", ");
}

function ExternalApiEventTable({ rows, expandedExternalApiEventId, setExpandedExternalApiEventId,
  deletingExternalApiEventId, deleteExternalApiLogs }) {
  const canDelete = Boolean(deleteExternalApiLogs);
  return (
    <table className="w-full min-w-[88rem] table-fixed text-sm">
      <colgroup>
        <col className="w-52" />
        <col className="w-36" />
        <col className="w-32" />
        <col className="w-28" />
        <col className="w-16" />
        <col className="w-24" />
        <col />
        <col className="w-52" />
        <col className="w-36" />
        {canDelete && <col className="w-24" />}
      </colgroup>
      <thead>
        <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
          <th className="px-4 py-3">Time</th>
          <th className="px-4 py-3">Service</th>
          <th className="px-4 py-3">API</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3 text-right">HTTP</th>
          <th className="px-4 py-3 text-right">Duration</th>
          <th className="px-4 py-3">Result</th>
          <th className="px-4 py-3">Suggestion recovery</th>
          <th className="px-4 py-3">User</th>
          {canDelete && <th className="px-4 py-3 text-right">Actions</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row) => {
          const expanded = expandedExternalApiEventId === row.id;
          const toggleExpanded = () => setExpandedExternalApiEventId(expanded ? null : row.id);
          const requestPayload = fmtExternalApiPayload(row.request_payload);
          const responsePayload = fmtExternalApiPayload(row.response_payload);
          const responseHeaders = fmtExternalApiPayload(row.response_headers);

          return (
            <Fragment key={row.id}>
              <tr
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={toggleExpanded}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleExpanded();
                  }
                }}
                className={`cursor-pointer ${expanded ? "bg-sky-50 hover:bg-sky-50" : "hover:bg-gray-50"}`}
              >
                <td className="px-4 py-3 text-gray-600">
                  <div className="flex items-center gap-2">
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"
                      className={`h-3 w-3 shrink-0 ${expanded ? "rotate-90 text-sky-600" : "text-gray-400"}`}>
                      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{fmtDateTime(row.created_at)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{fmtExternalApiService(row.service, row.endpoint)}</td>
                <td className="break-words px-4 py-3 text-gray-600">{fmtExternalApiNodes([row])}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "failure"
                    ? "bg-red-50 text-red-700"
                    : "bg-green-50 text-green-700"
                    }`}>
                    {row.status === "failure" ? "Failed" : "Successful"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{row.http_status ?? "—"}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                  {row.duration_ms == null ? "—" : `${fmtNum(row.duration_ms)} ms`}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-600">
                  {row.error_message || row.error_code || (row.response_payload ? "Response received" : "Completed")}
                </td>
                <td className="px-4 py-3">
                  {row.suggestion_recovery ? (
                    <div className="min-w-40">
                      <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Recovered with suggestion</span>
                      <p className="mt-1 text-xs text-gray-600">{row.suggestion_recovery.suggested_street}</p>
                    </div>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600 break-all">
                  <AdminUserCell row={row} />
                </td>
                {canDelete && <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    aria-label={`Delete API log ${row.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteExternalApiLogs(row);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    disabled={deletingExternalApiEventId !== null}
                    className="cursor-pointer rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingExternalApiEventId === row.id ? "Deleting..." : "Delete"}
                  </button>
                </td>}
              </tr>
              {expanded && (
                <tr>
                  <td colSpan={canDelete ? 10 : 9} className="bg-gray-50 px-4 py-4">
                    <div className="grid min-w-0 gap-4 [overflow-wrap:anywhere] lg:grid-cols-2">
                      <div className="min-w-0 space-y-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Endpoint</p>
                          <p className="mt-1 break-all text-sm text-gray-800">{row.endpoint || "Not recorded"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">User</p>
                          <div className="mt-1 break-all text-sm text-gray-800"><AdminUserCell row={row} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div>
                            <p className="text-xs text-gray-500">HTTP status</p>
                            <p className="mt-1 text-sm font-medium text-gray-800">{row.http_status ?? "No response"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Duration</p>
                            <p className="mt-1 text-sm font-medium text-gray-800">{row.duration_ms == null ? "—" : `${fmtNum(row.duration_ms)} ms`}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Error code</p>
                            <p className="mt-1 break-all text-sm font-medium text-gray-800">{row.error_code || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Error message</p>
                            <p className="mt-1 break-words text-sm font-medium text-gray-800">{row.error_message || "—"}</p>
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">User query / request payload</p>
                        {requestPayload ? (
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{requestPayload}</pre>
                        ) : (
                          <p className="mt-2 text-sm text-gray-500">No request payload recorded.</p>
                        )}
                      </div>
                      <div className="min-w-0 lg:col-span-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Worker response</p>
                        {responsePayload ? (
                          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{responsePayload}</pre>
                        ) : (
                          <p className="mt-2 text-sm text-gray-500">No response payload was received or recorded.</p>
                        )}
                      </div>
                      {responseHeaders && (
                        <div className="min-w-0 lg:col-span-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Diagnostic response headers</p>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{responseHeaders}</pre>
                        </div>
                      )}
                      {row.suggestion_recovery && (
                        <div className="min-w-0 lg:col-span-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Successful suggestion retry</p>
                          <p className="mt-1 text-sm text-gray-800">{row.suggestion_recovery.resolved_address}</p>
                          <p className="mt-1 text-xs text-gray-500">{fmtDateTime(row.suggestion_recovery.recovered_at)} · Source: {row.suggestion_recovery.lookup_source || "—"}</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function fmtExternalApiPayload(payload) {
  if (payload == null) return null;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

const BASE_FILTER_LABELS = {
  city: "City",
  district: "District",
  rooms_count: "Rooms",
  area_m2: "Area",
  floor: "Floor",
  total_floors: "Total floors",
  building_type: "Building type",
  renovation: "Renovation",
  bathrooms_count: "Bathrooms",
  balconies_count: "Balconies",
};

const ALERT_FILTER_LABELS = {
  price_min: "Min price",
  price_max: "Max price",
  max_price_per_m2: "Max price/m\u00B2",
  area_min: "Min area",
  area_max: "Max area",
  floor_min: "Min floor",
  floor_max: "Max floor",
  first_floor: "First floor",
  last_floor: "Last floor",
  seller_type: "Seller type",
};

function fmtAlertValue(key, value) {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (key.includes("price")) return fmtPrice(value);
  if (key.includes("area")) return `${fmtNum(value)} m\u00B2`;
  if (typeof value === "object") return null;
  return String(value);
}

function fmtFilterSummary(filters, labels) {
  if (!filters || typeof filters !== "object") return "\u2014";

  const parts = Object.entries(labels)
    .map(([key, label]) => {
      const value = fmtAlertValue(key, filters[key]);
      return value ? `${label}: ${value}` : null;
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" \u00B7 ") : "\u2014";
}

function fmtProperty(row) {
  return [
    row.roomsCount ? `${row.roomsCount} rooms` : null,
    row.areaM2 ? `${fmtNum(row.areaM2)} m\u00B2` : null,
    row.district,
    row.city,
  ].filter(Boolean).join(" · ") || "\u2014";
}

function CadastruResultBadges({ byResultType }) {
  const counts = byResultType || {};
  const items = [
    { key: "full", label: "full", count: counts.full_data },
    { key: "apt", label: "apt", count: counts.apartment_only },
    { key: "land", label: "land", count: counts.land_only },
    { key: "addr", label: "address", count: counts.address_only },
    { key: "none", label: "none", count: counts.no_data },
    { key: "fail", label: "failed", count: counts.error, isError: true },
  ].filter((item) => Boolean(item.count));

  if (!items.length) {
    return <span className="admin-stat-detail-subtle">No search data yet</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {items.map((item) => (
        <span
          key={item.key}
          className={item.isError ? "admin-stat-badge admin-stat-badge-danger" : "admin-stat-badge"}
        >
          {fmtNum(item.count)} {item.label}
        </span>
      ))}
    </span>
  );
}

function ListingAnalysesSummary({ analyses }) {
  const success = analyses?.success || 0;
  const unsupported = analyses?.unsupported || 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 font-medium">
      <span className="text-emerald-600 dark:text-emerald-400">
        {fmtNum(success)} analyzed
      </span>
      <span className="opacity-40">/</span>
      <span className={unsupported > 0 ? "text-amber-600 dark:text-amber-400" : "opacity-60"}>
        {fmtNum(unsupported)} rejected
      </span>
    </span>
  );
}

function CalculatorUsageSummary({ usage }) {
  const registered = usage?.registered || 0;
  const anonymous = usage?.anonymous || 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>
        <strong className="font-semibold text-gray-900 dark:text-slate-100">{fmtNum(registered)}</strong> registered
      </span>
      <span className="opacity-40">/</span>
      <span>
        <strong className="font-semibold text-gray-900 dark:text-slate-100">{fmtNum(anonymous)}</strong> anon
      </span>
    </span>
  );
}

function PdfGenerationSummary({ pdf }) {
  const registered = pdf?.registered || 0;
  const anonymous = pdf?.anonymous || 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span>
        <strong className="font-semibold text-gray-900 dark:text-slate-100">{fmtNum(registered)}</strong> registered
      </span>
      <span className="opacity-40">/</span>
      <span>
        <strong className="font-semibold text-gray-900 dark:text-slate-100">{fmtNum(anonymous)}</strong> anon
      </span>
    </span>
  );
}

function ExternalApiBadges({ usage }) {
  if (!usage?.total) {
    return <span className="admin-stat-detail-subtle">No external calls yet</span>;
  }
  const byService = usage.byService || {};
  const listing999 = byService["999_listing"]?.total || 0;
  const cadastru = (byService.cadastru_number?.total || 0) + (byService.cadastru_address?.total || 0);
  const nearby = byService.cadastru_nearby?.total || 0;
  const failure = usage.failure || 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="admin-stat-badge">
        999: {fmtNum(listing999)}
      </span>
      <span className="admin-stat-badge">
        cad: {fmtNum(cadastru)}
      </span>
      <span className="admin-stat-badge">
        near: {fmtNum(nearby)}
      </span>
      {failure > 0 && (
        <span className="admin-stat-badge admin-stat-badge-danger">
          {fmtNum(failure)} failed
        </span>
      )}
    </span>
  );
}

function ActiveUsersSummary({ s }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        New reg. users:{" "}
        <strong className="font-semibold text-gray-900 dark:text-slate-100">
          {s.newUsers == null ? "—" : fmtNum(s.newUsers)}
        </strong>
      </span>
      <span>
        Old reg. users:{" "}
        <strong className="font-semibold text-gray-900 dark:text-slate-100">
          {s.oldUsers == null ? "—" : fmtNum(s.oldUsers)}
        </strong>
      </span>
    </span>
  );
}

function StatCard({ label, value, detail, onClick, active = false }) {
  const isClickable = Boolean(onClick);

  const inner = (
    <>
      <div className="w-full">
        <div className="flex items-start justify-between gap-1.5">
          <p className="admin-stat-label line-clamp-2">
            {label}
          </p>
          {isClickable && (
            <span
              className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded transition-all duration-150 ${
                active
                  ? "text-primary dark:text-indigo-400 bg-primary/10 dark:bg-indigo-500/20"
                  : "text-gray-400 dark:text-slate-500 group-hover:text-primary dark:group-hover:text-indigo-400"
              }`}
              aria-hidden="true"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${active ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          )}
        </div>

        <div className="admin-stat-value">
          {value}
        </div>
      </div>

      {detail && (
        <div className="admin-stat-detail">
          {typeof detail === "string" && isClickable ? (
            <span
              className={`inline-flex items-center gap-1 font-medium transition-colors ${
                active
                  ? "text-primary dark:text-indigo-400"
                  : "text-gray-600 dark:text-slate-300 group-hover:text-primary dark:group-hover:text-indigo-300"
              }`}
            >
              {detail}
            </span>
          ) : (
            detail
          )}
        </div>
      )}
    </>
  );

  const cardClasses = `admin-stat-card group w-full ${isClickable ? "is-clickable" : ""} ${
    active ? "is-active" : ""
  }`;

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={cardClasses}
      >
        {inner}
      </button>
    );
  }

  return <div className={cardClasses}>{inner}</div>;
}

function CadastruSearchDetails({ row, userName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [expandedEventId, setExpandedEventId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/cadastru-searches/${row.id}`, { signal: controller.signal })
      .then(async (res) => {
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
        return result;
      })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message || "Failed to load search details"); });
    return () => controller.abort();
  }, [row.id, attempt]);

  if (error) return (
    <div role="alert" className="p-4 text-sm text-red-600">
      {error}
      <button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }} className="ml-3 cursor-pointer text-primary hover:underline">Retry</button>
    </div>
  );
  if (!data) return <p role="status" className="p-4 text-sm text-gray-500">Loading search details...</p>;

  const search = data.search;
  const request = fmtExternalApiPayload(search.search_request
    || (search.search_type === "number" ? { cadastral_number: search.cadastral_number } : { address: search.search_address }));
  return (
    <div className="min-w-0 space-y-4 p-4">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 text-sm text-gray-700 [overflow-wrap:anywhere]">
          <h4 className="font-semibold text-gray-900">Search details</h4>
          <p>Result type: {search.result_type || "Not recorded"}</p>
          <p>Returned value: {search.result_value || "Not recorded"}</p>
          <p>Lookup source: {search.lookup_source === "cache" ? "Cached" : search.lookup_source === "api" ? "External API" : search.lookup_source === "local" ? "Local fallback" : "Not recorded"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Saved search request</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{request}</pre>
        </div>
      </div>
      <div>
        <h4 className="font-semibold text-gray-900">External API calls · {fmtNum(data.events.length)}</h4>
        <p className="mt-1 text-xs text-gray-500">Recorded worker responses. Cached results, local fallbacks and access masking can change what was displayed; the exact page shown to the user was not saved.</p>
        {data.match === "inferred" && <p className="mt-1 text-xs text-amber-700">Older logs matched by the full search query and time.</p>}
      </div>
      {data.events.length ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <ExternalApiEventTable
            rows={data.events.map((event) => ({ ...event, user_name: event.user_id ? row.user_name || userName || event.user_id : null }))}
            expandedExternalApiEventId={expandedEventId}
            setExpandedExternalApiEventId={setExpandedEventId}
          />
        </div>
      ) : <p className="text-sm text-gray-500">No confidently linked worker logs found. Cached searches create no new worker logs; older or deleted logs may be unavailable.</p>}
    </div>
  );
}

function CadastruSearchTable({ rows, onDelete, deletingId, userName }) {
  const [expandedSearchId, setExpandedSearchId] = useState(null);
  if (!rows?.length) {
    return <div className="px-5 py-8 text-center text-gray-400">No cadastru searches found</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[84rem] table-fixed text-sm">
        <colgroup>
          <col className="w-52" /><col className="w-24" /><col className="w-28" /><col />
          <col className="w-24" /><col className="w-28" /><col className="w-24" />
          <col className="w-24" /><col className="w-32" /><col className="w-36" /><col className="w-24" />
        </colgroup>
        <thead className="sticky top-0">
          <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Search</th>
            <th className="px-4 py-3">District</th>
            <th className="px-4 py-3">Evaluation</th>
            <th className="px-4 py-3">Favorite</th>
            <th className="px-4 py-3 text-right" title="Explicit share clicks for this search, including re-shares">Shares</th>
            <th className="px-4 py-3 text-right" title="Unique accounts or logged-out browsers that opened this search's shared reports; excludes the signed-in sharer">Unique viewers</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const isExpanded = expandedSearchId === row.id;
            const toggleExpanded = () => setExpandedSearchId(isExpanded ? null : row.id);
            return (
              <Fragment key={row.id}>
                <tr role="button" tabIndex={0} aria-expanded={isExpanded} onClick={toggleExpanded}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleExpanded();
                    }
                  }}
                  className={`cursor-pointer ${isExpanded ? "bg-sky-50 hover:bg-sky-50" : "hover:bg-gray-50"}`}>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    <span aria-hidden="true" className={`mr-2 ${isExpanded ? "text-sky-600" : "text-gray-400"}`}>{isExpanded ? "▾" : "▸"}</span>
                    {fmtDateTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {fmtCadastruSearchType(row.search_type)}
                  </td>
                  <td className="px-4 py-3">
                    {row.result_type ? (
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.result_type === "error" ? "bg-red-50 text-red-700" : row.result_type === "no_data"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-green-50 text-green-700"}`}>
                        {row.result_type === "error" ? "Failed" : row.result_type === "no_data" ? "No result" : "Success"}
                      </span>
                    ) : "\u2014"}
                  </td>
                  <td className="max-w-xs break-words px-4 py-3 text-gray-600">
                    {row.search_type === "address"
                      ? row.search_address || row.cadastral_number || "\u2014"
                      : row.cadastral_number || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.district || "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {row.valuation_completed_at ? "Completed" : row.valuation_clicked_at ? "Started" : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmtBool(row.favorited)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtNum(row.share_count)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmtNum(row.unique_viewers)}</td>
                  <td className="px-4 py-3 text-gray-600 break-all">
                    <AdminUserCell row={row} name={row.user_name || userName} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => { event.stopPropagation(); onDelete(row); }}
                      onKeyDown={(event) => event.stopPropagation()}
                      disabled={deletingId === row.id}
                      className="cursor-pointer rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-default disabled:text-red-300"
                    >
                      {deletingId === row.id ? "Deleting..." : "Delete"}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr><td colSpan={11} className="bg-gray-50">
                    <CadastruSearchDetails row={row} userName={userName} />
                  </td></tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function UserCadastruSearches({ user, onDelete, deletingId, deleteError }) {
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ userId: user.id, offset: String(offset) });
    fetch(`/api/admin/cadastru-searches?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRows((current) => offset === 0 ? data.searches : [...current, ...data.searches]);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message || "Failed to load searches");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user.id, offset, attempt]);

  return (
    <div id={`user-cadastru-${user.id}`} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h4 className="font-semibold text-gray-900">Cadastru Searches · {user.name || user.email || user.id}</h4>
        <p className="mt-1 text-xs text-gray-500">All time · {fmtNum(user.cadastruSearches)} searches</p>
        {deleteError && <p role="alert" className="mt-2 text-xs text-red-500">{deleteError}</p>}
      </div>
      {rows.length > 0 && (
        <CadastruSearchTable rows={rows} userName={user.name || user.email || user.id} onDelete={onDelete} deletingId={deletingId} />
      )}
      {error ? (
        <div role="alert" className="px-4 py-3 text-sm text-red-500">
          {error}
          <button type="button" onClick={() => { setError(null); setLoading(true); setAttempt((value) => value + 1); }} className="ml-3 text-primary hover:underline">Retry</button>
        </div>
      ) : loading ? (
        <div className="px-4 py-4 text-sm text-gray-400">Loading searches...</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-4 text-sm text-gray-400">No cadastru searches found</div>
      ) : hasMore && (
        <button type="button" onClick={() => { setLoading(true); setOffset(rows.length); }} className="m-4 text-xs text-primary hover:underline">Load more</button>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <AdminWorkerStatus />
      <DashboardContent />
    </div>
  );
}

function DashboardContent() {
  const [loading, setLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [dashboardPeriod, setDashboardPeriod] = useState("day");
  const [error, setError] = useState(null);
  const [showUsersList, setShowUsersList] = useState(false);
  const [showPaymentsList, setShowPaymentsList] = useState(false);
  const [users, setUsers] = useState([]);
  const [lastVisitSort, setLastVisitSort] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [expandedUserCadastruId, setExpandedUserCadastruId] = useState(null);
  const [userCadastruVersion, setUserCadastruVersion] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserAdminSaving, setSelectedUserAdminSaving] = useState(false);
  const [selectedUserAdminError, setSelectedUserAdminError] = useState(null);
  const [selectedUserTransactions, setSelectedUserTransactions] = useState([]);
  const [selectedUserTransactionsLoading, setSelectedUserTransactionsLoading] = useState(false);
  const [selectedUserPackageMenuOpen, setSelectedUserPackageMenuOpen] = useState(false);
  const [selectedUserPackageDraft, setSelectedUserPackageDraft] = useState("");
  const [selectedUserPackageSaving, setSelectedUserPackageSaving] = useState(false);
  const [selectedUserPackageError, setSelectedUserPackageError] = useState(null);
  const [selectedUserCreditResetConfirming, setSelectedUserCreditResetConfirming] = useState(false);
  const [selectedUserCreditsAdjusting, setSelectedUserCreditsAdjusting] = useState(false);
  const [selectedUserCreditResetSaving, setSelectedUserCreditResetSaving] = useState(false);
  const [selectedUserCreditResetError, setSelectedUserCreditResetError] = useState(null);
  const [activeEstimationsType, setActiveEstimationsType] = useState(null);
  const [estimations, setEstimations] = useState([]);
  const [estimationsLoading, setEstimationsLoading] = useState(false);
  const [estimationsError, setEstimationsError] = useState(null);
  const [showTelegramAlertsList, setShowTelegramAlertsList] = useState(false);
  const [showPdfGenerationList, setShowPdfGenerationList] = useState(false);
  const [showCadastruSearchesList, setShowCadastruSearchesList] = useState(false);
  const [deletingCadastruSearchId, setDeletingCadastruSearchId] = useState(null);
  const [cadastruSearchDeleteError, setCadastruSearchDeleteError] = useState(null);
  const [showListingLinkAnalysesList, setShowListingLinkAnalysesList] = useState(false);
  const [showExternalApiUsageList, setShowExternalApiUsageList] = useState(false);
  const [externalApiStatusFilter, setExternalApiStatusFilter] = useState("all");
  const [expandedExternalApiGroupId, setExpandedExternalApiGroupId] = useState(null);
  const [expandedExternalApiEventId, setExpandedExternalApiEventId] = useState(null);
  const [deletingExternalApiEventId, setDeletingExternalApiEventId] = useState(null);
  const [externalApiDeleteError, setExternalApiDeleteError] = useState(null);
  const [showCalculatorUsageList, setShowCalculatorUsageList] = useState(false);
  const selectedUserPopupRef = useRef(null);
  const statsRequestIdRef = useRef(0);

  const loadStats = useCallback(async ({ fresh = false } = {}) => {
    const requestId = ++statsRequestIdRef.current;
    setStatsRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams({ period: dashboardPeriod });
      if (fresh) params.set("fresh", "1");
      const res = await fetch(`/api/admin/stats?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (requestId !== statsRequestIdRef.current) return;
      setStats(data);
    } catch (err) {
      if (requestId !== statsRequestIdRef.current) return;
      setError(err.message || "Failed to load stats");
    } finally {
      if (requestId === statsRequestIdRef.current) {
        setLoading(false);
        setStatsRefreshing(false);
      }
    }
  }, [dashboardPeriod]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (!selectedUser?.id) {
      setSelectedUserTransactions([]);
      setSelectedUserTransactionsLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedUserTransactionsLoading(true);

    fetch(`/api/admin/users/${selectedUser.id}/transactions`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSelectedUserTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedUserTransactions([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSelectedUserTransactionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUser?.id]);

  useEffect(() => {
    setSelectedUserPackageDraft(selectedUser?.packageKey || "");
    setSelectedUserPackageMenuOpen(false);
    setSelectedUserPackageError(null);
    setSelectedUserPackageSaving(false);
    setSelectedUserCreditResetConfirming(false);
    setSelectedUserCreditResetSaving(false);
    setSelectedUserCreditResetError(null);
    setSelectedUserAdminError(null);
  }, [selectedUser?.id, selectedUser?.packageKey]);

  useEffect(() => {
    if (!selectedUser) return undefined;

    const handlePointerDown = (event) => {
      if (selectedUserAdminSaving || selectedUserCreditsAdjusting || selectedUserPackageSaving || selectedUserCreditResetSaving || selectedUserPopupRef.current?.contains(event.target)) return;
      setSelectedUser(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [selectedUser, selectedUserAdminSaving, selectedUserCreditsAdjusting, selectedUserPackageSaving, selectedUserCreditResetSaving]);

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/admin/users?fresh=1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      setUsersError(err.message || "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleUsersList = () => {
    const next = !showUsersList;
    setShowUsersList(next);
    if (next && users.length === 0 && !usersLoading) {
      loadUsers();
    }
  };

  const saveSelectedUserPackage = async () => {
    if (selectedUserAdminSaving || selectedUserCreditsAdjusting || !selectedUser?.id || !selectedUserPackageDraft || selectedUserPackageDraft === selectedUser.packageKey) return;

    setSelectedUserPackageSaving(true);
    setSelectedUserPackageError(null);

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey: selectedUserPackageDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const updatedUser = {
        ...selectedUser,
        packageKey: data.packageKey,
        packageSource: "admin",
        sharedCredits: data.sharedCredits,
        freeMonthlyCredit: data.freeMonthlyCredit,
        credits: Array.isArray(data.credits) ? data.credits : selectedUser.credits,
        freeMonthlyCredits: Array.isArray(data.freeMonthlyCredits) ? data.freeMonthlyCredits : selectedUser.freeMonthlyCredits,
      };

      setSelectedUser(updatedUser);
      setUsers((items) => items.map((item) => item.id === updatedUser.id ? updatedUser : item));
      setSelectedUserPackageMenuOpen(false);
      setSelectedUserPackageDraft(data.packageKey);
    } catch (err) {
      setSelectedUserPackageError(err.message || "Nu s-a putut salva pachetul");
    } finally {
      setSelectedUserPackageSaving(false);
    }
  };

  const resetSelectedUserCredits = async () => {
    if (selectedUserAdminSaving || selectedUserCreditsAdjusting || !selectedUser?.id || !selectedUser.packageKey) return;

    setSelectedUserCreditResetSaving(true);
    setSelectedUserCreditResetError(null);

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey: selectedUser.packageKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const updatedUser = {
        ...selectedUser,
        packageKey: data.packageKey,
        packageSource: "admin",
        sharedCredits: data.sharedCredits,
        freeMonthlyCredit: data.freeMonthlyCredit,
        credits: Array.isArray(data.credits) ? data.credits : selectedUser.credits,
        freeMonthlyCredits: Array.isArray(data.freeMonthlyCredits) ? data.freeMonthlyCredits : selectedUser.freeMonthlyCredits,
      };

      setSelectedUser(updatedUser);
      setUsers((items) => items.map((item) => item.id === updatedUser.id ? updatedUser : item));
      setSelectedUserCreditResetConfirming(false);
    } catch (err) {
      setSelectedUserCreditResetError(err.message || "Nu s-a putut reseta accesul");
    } finally {
      setSelectedUserCreditResetSaving(false);
    }
  };

  const toggleSelectedUserAdmin = async () => {
    if (!selectedUser?.id || selectedUserAdminSaving || selectedUserPackageSaving || selectedUserCreditResetSaving || selectedUserCreditsAdjusting) return;
    const userId = selectedUser.id;
    setSelectedUserAdminSaving(true);
    setSelectedUserAdminError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin: !selectedUser.isAdmin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Nu s-a putut salva statutul de admin.");
      setSelectedUser(current => current?.id === userId ? { ...current, isAdmin: data.isAdmin } : current);
      setUsers(items => items.map(item => item.id === userId ? { ...item, isAdmin: data.isAdmin } : item));
    } catch (err) {
      setSelectedUserAdminError(err.message || "Nu s-a putut salva statutul de admin.");
    } finally {
      setSelectedUserAdminSaving(false);
    }
  };

  const loadEstimations = async (type) => {
    setEstimationsLoading(true);
    setEstimationsError(null);
    setEstimations([]);
    try {
      const params = new URLSearchParams({ type, period: dashboardPeriod });
      const res = await fetch(`/api/admin/estimations?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEstimations(Array.isArray(data.estimations) ? data.estimations : []);
    } catch (err) {
      setEstimationsError(err.message || "Failed to load estimations");
    } finally {
      setEstimationsLoading(false);
    }
  };

  const toggleEstimationsList = (type) => {
    if (activeEstimationsType === type) {
      setActiveEstimationsType(null);
      return;
    }
    setActiveEstimationsType(type);
    loadEstimations(type);
  };

  const handleDashboardPeriodChange = (period) => {
    if (period === dashboardPeriod) return;
    statsRequestIdRef.current += 1;
    setDashboardPeriod(period);
    setExpandedExternalApiEventId(null);
    setExpandedExternalApiGroupId(null);
    setActiveEstimationsType(null);
    setEstimations([]);
  };

  const deleteCadastruSearch = async (row) => {
    if (!row?.id || deletingCadastruSearchId !== null) return;
    const confirmed = window.confirm("Delete this cadastru search?");
    if (!confirmed) return;

    setDeletingCadastruSearchId(row.id);
    setCadastruSearchDeleteError(null);

    try {
      const res = await fetch(`/api/admin/cadastru-searches?id=${row.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUserCadastruVersion((value) => value + 1);
      await Promise.all([loadStats({ fresh: true }), users.length > 0 ? loadUsers() : Promise.resolve()]);
    } catch (err) {
      setCadastruSearchDeleteError(err.message || "Failed to delete cadastru search");
    } finally {
      setDeletingCadastruSearchId(null);
    }
  };

  const deleteExternalApiLogs = async (row = null) => {
    if (deletingExternalApiEventId !== null) return;
    const confirmed = window.confirm(row
      ? "Permanently delete this API log and its request/response details? Its status count and total will decrease by one."
      : "Permanently delete ALL failed worker logs across all services and dates, including secondary-service and 999 errors outside the current table, and reset their error counts to zero?");
    if (!confirmed) return;

    setDeletingExternalApiEventId(row ? row.id : "all");
    setExternalApiDeleteError(null);
    try {
      const params = new URLSearchParams(row
        ? { apiEventId: row.id }
        : { allFailedApiEvents: "1" });
      const res = await fetch(`/api/admin/stats?${params.toString()}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setExpandedExternalApiEventId(null);
      setExpandedExternalApiGroupId(null);
      setStats((current) => ({
        ...current,
        externalApiUsage: {
          ...current.externalApiUsage,
          events: (current.externalApiUsage.events || []).filter((event) => row
            ? event.id !== row.id
            : event.status !== "failure"),
        },
      }));
      await loadStats({ fresh: true });
    } catch (err) {
      setExternalApiDeleteError(err.message || "Failed to delete API logs");
    } finally {
      setDeletingExternalApiEventId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!stats || String(error || "").includes("401")) {
    const isAuthError = String(error || "").includes("401");
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          {isAuthError ? (
            <>
              <p className="text-red-500 font-medium">Session Expired</p>
            </>
          ) : (
            <>
              <p className="text-red-500 font-medium">Failed to load dashboard</p>
              <p className="text-sm text-gray-400">{error}</p>
              <button
                onClick={() => loadStats({ fresh: true })}
                disabled={statsRefreshing}
                className="mt-2 px-4 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                {statsRefreshing ? "Refreshing..." : "Retry"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const s = stats;
  const sortedUsers = lastVisitSort ? [...users].sort((a, b) => {
    const aTime = Date.parse(a.lastVisitAt);
    const bTime = Date.parse(b.lastVisitAt);
    if (!Number.isFinite(aTime)) return Number.isFinite(bTime) ? 1 : 0;
    if (!Number.isFinite(bTime)) return -1;
    return lastVisitSort === "desc" ? bTime - aTime : aTime - bTime;
  }) : users;
  const externalApiEvents = Array.isArray(s.externalApiUsage?.events)
    ? s.externalApiUsage.events
    : [];
  const cachedSearches = Array.isArray(s.externalApiUsage?.cachedSearches) ? s.externalApiUsage.cachedSearches : [];
  const externalApiGroups = groupExternalApiEvents(externalApiEvents, externalApiStatusFilter, cachedSearches);

  return (
    <div className="space-y-8">
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-4 sm:py-6">
          <div ref={selectedUserPopupRef} className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedUser.name || "\u2014"}</h2>
                <VisitorTags visitor={selectedUser.visitor} />
                {selectedUser.email && <p className="mt-0.5 text-sm text-gray-500">{selectedUser.email}</p>}
                <button
                  type="button"
                  aria-pressed={!!selectedUser.isAdmin}
                  onClick={toggleSelectedUserAdmin}
                  disabled={selectedUserAdminSaving || selectedUserPackageSaving || selectedUserCreditResetSaving || selectedUserCreditsAdjusting}
                  className={`mt-2 cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${selectedUser.isAdmin ? "border-sky-200 bg-sky-50 text-sky-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {selectedUserAdminSaving ? "Salvare..." : selectedUser.isAdmin ? "Admin · Elimină" : "Marchează ca admin"}
                </button>
                {selectedUserAdminError && <p role="alert" className="mt-1 text-xs text-red-600">{selectedUserAdminError}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserPackageMenuOpen((value) => !value);
                      setSelectedUserCreditResetConfirming(false);
                    }}
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${userPackageClassName(selectedUser)}`}
                  >
                    {fmtUserPackage(selectedUser.packageKey)}
                  </button>
                  {selectedUserPackageMenuOpen && (
                    <div className="absolute right-0 top-full z-10 mt-2 w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      <select
                        value={selectedUserPackageDraft}
                        onChange={(event) => setSelectedUserPackageDraft(event.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-primary"
                      >
                        {USER_PACKAGE_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                      {selectedUserPackageDraft && selectedUserPackageDraft !== selectedUser.packageKey && (
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserPackageDraft(selectedUser.packageKey);
                              setSelectedUserPackageMenuOpen(false);
                              setSelectedUserPackageError(null);
                            }}
                            disabled={selectedUserAdminSaving || selectedUserPackageSaving || selectedUserCreditsAdjusting || selectedUserCreditResetSaving}
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:text-gray-400"
                          >
                            Anulează
                          </button>
                          <button
                            type="button"
                            onClick={saveSelectedUserPackage}
                            disabled={selectedUserAdminSaving || selectedUserPackageSaving || selectedUserCreditsAdjusting || selectedUserCreditResetSaving}
                            className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primary-dark disabled:bg-gray-300"
                          >
                            {selectedUserPackageSaving ? "Salvare..." : "Salvează"}
                          </button>
                        </div>
                      )}
                      {selectedUserPackageError && (
                        <p className="mt-2 text-xs font-medium text-red-500">{selectedUserPackageError}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserCreditResetConfirming((value) => !value);
                      setSelectedUserCreditResetError(null);
                      setSelectedUserPackageMenuOpen(false);
                    }}
                    className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    Reset
                  </button>
                  {selectedUserCreditResetConfirming && (
                    <div className="absolute right-0 top-full z-10 mt-2 w-52 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                      <p className="text-xs font-medium text-gray-700">Restabilești creditele pachetului curent?</p>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserCreditResetConfirming(false);
                            setSelectedUserCreditResetError(null);
                          }}
                          disabled={selectedUserAdminSaving || selectedUserCreditResetSaving || selectedUserCreditsAdjusting || selectedUserPackageSaving}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:text-gray-400"
                        >
                          Anulează
                        </button>
                        <button
                          type="button"
                          onClick={resetSelectedUserCredits}
                          disabled={selectedUserAdminSaving || selectedUserCreditResetSaving || selectedUserCreditsAdjusting || selectedUserPackageSaving}
                          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primary-dark disabled:bg-gray-300"
                        >
                          {selectedUserCreditResetSaving ? "Resetare..." : "Confirmă"}
                        </button>
                      </div>
                      {selectedUserCreditResetError && (
                        <p className="mt-2 text-xs font-medium text-red-500">{selectedUserCreditResetError}</p>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  disabled={selectedUserAdminSaving || selectedUserCreditsAdjusting || selectedUserPackageSaving || selectedUserCreditResetSaving}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-5">
              <AdminUserCredits
                key={selectedUser.id}
                user={selectedUser}
                disabled={selectedUserAdminSaving || selectedUserPackageSaving || selectedUserCreditResetSaving}
                onBusyChange={setSelectedUserCreditsAdjusting}
                onUpdate={(userId, sharedCredits) => {
                  setSelectedUser(current => current?.id === userId ? { ...current, sharedCredits } : current);
                  setUsers(items => items.map(item => item.id === userId ? { ...item, sharedCredits } : item));
                }}
              />
              <div className="mt-5">
                <h3 className="mb-3 text-base font-semibold text-gray-900">Plăți</h3>
                {selectedUserTransactionsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-gray-400" />
                  </div>
                ) : (
                  <ProfileTransactionsTable
                    transactions={selectedUserTransactions}
                    allowRefund
                    onPaymentUpdate={async () => {
                      const response = await fetch(`/api/admin/users/${selectedUser.id}/transactions`);
                      if (response.ok) { const data = await response.json(); setSelectedUserTransactions(data.transactions || []); }
                    }}
                    lang="ro"
                    formatProduct={(productKey) => PAYMENT_PRODUCT_LABELS_RO[productKey] || productKey || "—"}
                    formatStatus={(status) => PAYMENT_STATUS_LABELS_RO[status] || status || "—"}
                    isDarkMode
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <AdminOnlineUsers />
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="inline-flex w-full rounded-lg border border-gray-200 bg-white p-1 sm:w-auto">
            {DASHBOARD_PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => handleDashboardPeriodChange(option.key)}
                className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${dashboardPeriod === option.key
                  ? "bg-primary text-white"
                  : "text-gray-600 hover:bg-gray-50"
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => loadStats({ fresh: true })}
            disabled={statsRefreshing}
            className="w-full cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-primary/40 hover:text-primary disabled:text-gray-400 disabled:hover:border-gray-200 sm:w-auto"
          >
            {statsRefreshing ? "Refreshing..." : "Hard refresh"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">Failed to refresh dashboard: {error}</p>
      )}

      {/* Users & App Usage */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Users & App Usage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6 gap-3.5">
          <StatCard
            label="Active Users"
            value={s.activeUsers == null ? "Unavailable" : fmtNum(s.activeUsers)}
            detail={<ActiveUsersSummary s={s} />}
            onClick={toggleUsersList}
            active={showUsersList}
          />
          <StatCard
            label="Payments"
            value={s.payments?.available === false ? "Unavailable" : fmtNum(s.payments?.total)}
            detail={showPaymentsList ? "Hide payment records" : "View payment records"}
            onClick={() => setShowPaymentsList((value) => !value)}
            active={showPaymentsList}
          />
          <StatCard
            label="Checkout Popup Opened"
            value={fmtNum(s.paymentCheckout?.popup?.total)}
            detail={fmtCheckoutSummary(s.paymentCheckout?.popup)}
          />
          <StatCard
            label="Pricing Page Opened"
            value={fmtNum(s.paymentCheckout?.pricingPage?.total)}
            detail={fmtCheckoutSummary(s.paymentCheckout?.pricingPage)}
          />
          <StatCard
            label="Checkout Page Opened"
            value={fmtNum(s.paymentCheckout?.page?.total)}
            detail={fmtCheckoutSummary(s.paymentCheckout?.page)}
          />
          <StatCard
            label="Continue to MAIB Clicked"
            value={fmtNum(s.paymentCheckout?.maibContinue?.total)}
            detail={fmtCheckoutSummary(s.paymentCheckout?.maibContinue)}
          />
          <StatCard
            label="Prețuri actuale Popup"
            value={s.marketTrendsPopup?.available === false ? "—" : fmtNum(s.marketTrendsPopup?.total)}
            detail={s.marketTrendsPopup?.available === false ? "Apply trends SQL" : "Popup impressions"}
          />
          <StatCard
            label="Sale Estimations"
            value={fmtNum(s.totalSaleEstimations ?? s.totalEstimations)}
            detail={activeEstimationsType === "sale" ? "Hide estimations list" : "View recent estimations"}
            onClick={() => toggleEstimationsList("sale")}
            active={activeEstimationsType === "sale"}
          />
          <StatCard
            label="Rent Estimations"
            value={fmtNum(s.totalRentEstimations)}
            detail={activeEstimationsType === "rent" ? "Hide estimations list" : "View recent estimations"}
            onClick={() => toggleEstimationsList("rent")}
            active={activeEstimationsType === "rent"}
          />
          <StatCard
            label="Cadastru Searches"
            value={fmtNum(s.cadastruSearches?.total)}
            detail={showCadastruSearchesList ? "Hide search records" : <CadastruResultBadges byResultType={s.cadastruSearches?.byResultType} />}
            onClick={() => setShowCadastruSearchesList((value) => !value)}
            active={showCadastruSearchesList}
          />
          <StatCard
            label="999 Link Analyses"
            value={fmtNum(s.listingLinkAnalyses?.total)}
            detail={showListingLinkAnalysesList ? "Hide analyses list" : <ListingAnalysesSummary analyses={s.listingLinkAnalyses} />}
            onClick={() => setShowListingLinkAnalysesList((value) => !value)}
            active={showListingLinkAnalysesList}
          />
          <StatCard
            label="Calculator Usage"
            value={fmtNum(s.calculatorUsage?.total)}
            detail={showCalculatorUsageList ? "Hide calculator logs" : <CalculatorUsageSummary usage={s.calculatorUsage} />}
            onClick={() => setShowCalculatorUsageList((value) => !value)}
            active={showCalculatorUsageList}
          />
          <StatCard
            label="PDF Reports"
            value={fmtNum(s.pdfGeneration?.total)}
            detail={showPdfGenerationList ? "Hide report logs" : <PdfGenerationSummary pdf={s.pdfGeneration} />}
            onClick={() => setShowPdfGenerationList((value) => !value)}
            active={showPdfGenerationList}
          />
          <StatCard
            label="Shared Links"
            value={fmtNum(s.totalSharedLinks)}
            detail="Total shared properties"
          />
          <StatCard
            label="Favorites"
            value={fmtNum(s.totalFavorites)}
            detail="Saved to favorites"
          />
          <StatCard
            label="Telegram Alerts"
            value={fmtNum(s.totalTelegramAlerts)}
            detail={showTelegramAlertsList ? "Hide alerts list" : "View active alerts"}
            onClick={() => setShowTelegramAlertsList((value) => !value)}
            active={showTelegramAlertsList}
          />
          <StatCard
            label="External API"
            value={fmtNum(s.externalApiUsage?.total)}
            detail={showExternalApiUsageList ? "Hide API request logs" : <ExternalApiBadges usage={s.externalApiUsage} />}
            onClick={() => setShowExternalApiUsageList((value) => !value)}
            active={showExternalApiUsageList}
          />
        </div>
        {showPaymentsList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Payments</h3>
            </div>

            {s.payments?.available === false ? (
              <div className="px-5 py-8 text-center text-amber-600">Payment data is unavailable</div>
            ) : !Array.isArray(s.payments?.orders) || s.payments.orders.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No payments found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase [&>*+*]:border-l [&>*+*]:border-gray-100">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Payment Date</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Provider</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.payments.orders.map((payment) => (
                      <tr key={`${payment.provider}:${payment.id}`} className="hover:bg-gray-50 [&>*+*]:border-l [&>*+*]:border-gray-100">
                        <td className="px-4 py-3 text-gray-900 font-medium"><div title="Last recorded browser for this account"><AdminUserCell row={payment} name={payment.name || payment.user_id || "Deleted user"} /></div></td>
                        <td className="px-4 py-3 text-gray-600">{payment.email || "\u2014"}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDateTime(payment.paid_at || payment.created_at)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {PAYMENT_PRODUCT_LABELS_RO[payment.product_key] || payment.product_key || "\u2014"}
                          <div className="mt-0.5 text-xs text-gray-400">{payment.id}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPaymentAmount(payment.amount_minor, payment.currency_code)}
                          {payment.refunded_minor > 0 && (
                            <div className="text-xs">−{fmtPaymentAmount(payment.refunded_minor, payment.currency_code)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{PAYMENT_STATUS_LABELS_RO[payment.status] || payment.status}</td>
                        <td className="px-4 py-3 text-gray-600 uppercase">{payment.provider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showUsersList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Registered Users</h3>
              <button
                type="button"
                onClick={loadUsers}
                disabled={usersLoading}
                className="text-xs text-primary hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {usersLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {usersError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-500 font-medium">Failed to load users</p>
                <p className="text-xs text-gray-400 mt-1">{usersError}</p>
              </div>
            ) : usersLoading && users.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No users found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase [&>*+*]:border-l [&>*+*]:border-gray-100">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Package</th>
                      <th className="px-4 py-3">Registered Type</th>
                      <th className="px-4 py-3">Registered Date</th>
                      <th className="px-4 py-3" aria-sort={lastVisitSort === "desc" ? "descending" : lastVisitSort === "asc" ? "ascending" : "none"}>
                        <button
                          type="button"
                          onClick={() => setLastVisitSort((current) => current === "desc" ? "asc" : "desc")}
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap uppercase hover:text-gray-700"
                        >
                          Last Visit
                          <span aria-hidden="true">{lastVisitSort === "desc" ? "↓" : lastVisitSort === "asc" ? "↑" : "↕"}</span>
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">Estimations</th>
                      <th className="px-4 py-3 text-right">Cadastru Searches</th>
                      <th className="px-4 py-3 text-right">Calculator Usage</th>
                      <th className="px-4 py-3 text-right">PDF Reports</th>
                      <th className="px-4 py-3 text-right">999 Links</th>
                      <th className="px-4 py-3 text-right">Shared Links</th>
                      <th className="px-4 py-3 text-right">Favorites</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedUsers.map((u) => (
                      <Fragment key={u.id}>
                        <tr className={`${u.isAdmin ? "admin-user-row" : "hover:bg-gray-50"} [&>*+*]:border-l [&>*+*]:border-gray-100`}>
                          <td className="px-4 py-3 text-gray-900 font-medium">
                            <button
                              type="button"
                              onClick={() => setSelectedUser(u)}
                              className="cursor-pointer text-left font-medium text-primary hover:underline"
                            >
                              {u.name || "\u2014"}
                            </button>
                            <VisitorTags visitor={u.visitor} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${userPackageClassName(u)}`}>
                              {fmtUserPackage(u.packageKey)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {u.email ? (
                              <Tooltip text={u.email}>
                                <span className="cursor-help">{u.authProvider || "\u2014"}</span>
                              </Tooltip>
                            ) : (
                              u.authProvider || "\u2014"
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {fmtDate(u.registeredAt)}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {fmtDateTime(u.lastVisitAt)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmtNum(u.totalEstimations)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            <button
                              type="button"
                              aria-expanded={expandedUserCadastruId === u.id}
                              aria-controls={`user-cadastru-${u.id}`}
                              aria-label={`${expandedUserCadastruId === u.id ? "Hide" : "Show"} cadastru searches for ${u.name || u.email || u.id}`}
                              onClick={() => {
                                setExpandedUserCadastruId((current) => current === u.id ? null : u.id);
                                setCadastruSearchDeleteError(null);
                              }}
                              className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary hover:underline"
                            >
                              {fmtNum(u.cadastruSearches)}
                              <span aria-hidden="true">{expandedUserCadastruId === u.id ? "▾" : "▸"}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmtNum(u.calculatorUsage)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmtNum(u.pdfReports)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmtNum(u.listingLinks)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmtNum(u.sharedLinks)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {fmtNum(u.favorites)}
                          </td>
                        </tr>
                        {expandedUserCadastruId === u.id && (
                          <tr className="bg-gray-50">
                            <td colSpan={12} className="p-4">
                              <UserCadastruSearches
                                key={`${u.id}-${userCadastruVersion}`}
                                user={u}
                                onDelete={deleteCadastruSearch}
                                deletingId={deletingCadastruSearchId}
                                deleteError={cadastruSearchDeleteError}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {activeEstimationsType && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                Recent {activeEstimationsType === "rent" ? "Rent" : "Sale"} Estimations
              </h3>
              <button
                type="button"
                onClick={() => loadEstimations(activeEstimationsType)}
                disabled={estimationsLoading}
                className="text-xs text-primary hover:underline disabled:text-gray-400 disabled:no-underline"
              >
                {estimationsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {estimationsError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-500 font-medium">Failed to load estimations</p>
                <p className="text-xs text-gray-400 mt-1">{estimationsError}</p>
              </div>
            ) : estimationsLoading && estimations.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">Loading estimations...</div>
            ) : estimations.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No estimations found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Estimate</th>
                      <th className="px-4 py-3 text-right">Shared</th>
                      <th className="px-4 py-3 text-right">Favorite</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {estimations.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          <div>{fmtProperty(row)}</div>
                          <div className="mt-0.5 text-xs font-normal text-gray-500">
                            {[row.buildingType, row.renovation].filter(Boolean).join(" · ") || "\u2014"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <AdminUserCell row={row} />
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPrice(row.estimatedPrice)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtBool(row.shared)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {fmtBool(row.favorited)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showPdfGenerationList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">PDF Reports</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.pdfGeneration?.periods?.["24h"])} in 24h · {fmtNum(s.pdfGeneration?.periods?.["7d"])} in 7 days · {fmtNum(s.pdfGeneration?.withCadastral)} with cadastral
              </p>
            </div>

            {!Array.isArray(s.pdfGeneration?.recent) || s.pdfGeneration.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No PDF reports generated</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Cadastral</th>
                      <th className="px-4 py-3">Session</th>
                      <th className="px-4 py-3">Estimate Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.pdfGeneration.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium break-all">
                          <AdminUserCell row={row} name={row.user_id || undefined} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtBool(row.included_cadastral)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all">
                          {row.session_id || row.device_id || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all">
                          {row.estimate_log_id || "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showCadastruSearchesList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Cadastru Searches</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.cadastruSearches?.total)} searches · {s.periodLabel} · {fmtNum(s.cadastruSearches?.registered)} registered / {fmtNum(s.cadastruSearches?.anonymous)} anonymous
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.cadastruSearches?.address)} address / {fmtNum(s.cadastruSearches?.number)} number · {fmtCadastruResultSummary(s.cadastruSearches?.byResultType)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {fmtTopDistricts(s.cadastruSearches?.byDistrict)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {fmtCadastruSourceSummary(s.cadastruSearches?.byLookupSource)}
              </p>
              {cadastruSearchDeleteError && (
                <p className="mt-2 text-xs font-medium text-red-500">{cadastruSearchDeleteError}</p>
              )}
            </div>

            <CadastruSearchTable
              rows={s.cadastruSearches?.recent}
              onDelete={deleteCadastruSearch}
              deletingId={deletingCadastruSearchId}
            />
          </div>
        )}
        {showListingLinkAnalysesList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">999 Link Analyses</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.listingLinkAnalyses?.periods?.["24h"])} in 24h · {fmtNum(s.listingLinkAnalyses?.periods?.["7d"])} in 7 days · {fmtNum(s.listingLinkAnalyses?.failed)} failed
              </p>
            </div>

            {!Array.isArray(s.listingLinkAnalyses?.recent) || s.listingLinkAnalyses.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No 999 link analyses found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Listing</th>
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.listingLinkAnalyses.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {fmtListingLinkStatus(row.status)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          {row.listing_url ? (
                            <a
                              href={row.listing_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              {row.external_id || row.listing_url}
                            </a>
                          ) : (
                            row.external_id || "\u2014"
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtListingLinkProperty(row)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPrice(row.listing_price, row.listing_currency)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          <AdminUserCell row={row} name={row.user_id || undefined} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showExternalApiUsageList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">External API Usage</h3>
                <p className="mt-1 text-xs text-gray-500">
                  {s.periodLabel} · {fmtNum(s.externalApiUsage?.success)} successful · {fmtNum(s.externalApiUsage?.failure)} failed
                  {s.externalApiUsage?.otherFailure > 0 && ` · ${fmtNum(s.externalApiUsage.otherFailure)} other errors`}
                </p>
                <p className="mt-1 text-xs text-gray-500">Failed counts and the Failed filter include only Cadastru address and number lookup failures.</p>
                <p className="mt-1 text-xs text-gray-500">Cached searches are included below and do not add API calls.</p>
              </div>
              <div className="inline-flex w-full rounded-lg border border-gray-200 bg-white p-1 sm:w-auto">
                {EXTERNAL_API_STATUS_FILTERS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      setExternalApiStatusFilter(option.key);
                      setExpandedExternalApiEventId(null);
                      setExpandedExternalApiGroupId(null);
                    }}
                    className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${externalApiStatusFilter === option.key
                      ? "bg-primary text-white"
                      : "text-gray-600 hover:bg-gray-50"
                      }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {externalApiStatusFilter === "all" && (
              <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3">
                <button
                  type="button"
                  onClick={() => deleteExternalApiLogs()}
                  disabled={deletingExternalApiEventId !== null || !s.externalApiUsage?.detailsAvailable}
                  className="cursor-pointer rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingExternalApiEventId === "all" ? "Deleting..." : "Delete all failed worker logs"}
                </button>
                <span className="text-xs text-gray-500">All services and dates · Includes secondary-service and 999 errors</span>
              </div>
            )}
            {externalApiDeleteError && (
              <p role="alert" className="px-5 py-3 text-sm text-red-600">{externalApiDeleteError}</p>
            )}

            {!s.externalApiUsage?.total && externalApiEvents.length === 0 && cachedSearches.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No external API calls or cached searches found</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 border-b border-gray-100">
                  {Object.entries(s.externalApiUsage.byService || {}).map(([service, item]) => (
                    <div key={service} className="border-gray-100 px-5 py-4 sm:odd:border-r xl:border-r xl:last:border-r-0">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {fmtExternalApiService(service)}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{fmtNum(item.total)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {fmtNum(item.success)} successful · {fmtNum(item.failure)} {service === "cadastru_address" || service === "cadastru_number" ? "failed" : "errors"}
                      </p>
                    </div>
                  ))}
                </div>
                {externalApiGroups.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400">
                    {externalApiStatusFilter === "all"
                      ? "No request-level external API rows found"
                      : `No ${externalApiStatusFilter === "failure" ? "failed" : "successful"} requests found`}
                  </div>
                ) : (
                  <div className="max-h-[36rem] overflow-auto [scrollbar-gutter:stable] [overflow-anchor:none]">
                    <table className="w-full min-w-[64rem] table-fixed text-sm">
                      <colgroup>
                        <col className="w-52" />
                        <col />
                        <col className="w-32" />
                        <col className="w-36" />
                        <col className="w-44" />
                        <col className="w-36" />
                      </colgroup>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Search / request</th>
                          <th className="px-4 py-3">API</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">API calls</th>
                          <th className="px-4 py-3">User</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {externalApiGroups.map((group) => {
                          const expanded = expandedExternalApiGroupId === group.id;
                          const toggleExpanded = () => {
                            setExpandedExternalApiGroupId(expanded ? null : group.id);
                            setExpandedExternalApiEventId(null);
                          };
                          return (
                            <Fragment key={group.id}>
                              <tr role="button" tabIndex={0} aria-expanded={expanded}
                                onClick={toggleExpanded}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleExpanded();
                                  }
                                }}
                                className={`cursor-pointer ${expanded ? "bg-sky-50" : "hover:bg-gray-50"}`}>
                                <td className="px-4 py-3 text-gray-600">
                                  <div className="flex items-center gap-2">
                                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"
                                      className={`h-3 w-3 shrink-0 ${expanded ? "rotate-90 text-sky-600" : "text-gray-400"}`}>
                                      <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    <span>{fmtDateTime(group.created_at)}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="truncate font-medium text-gray-900" title={String(group.query)}>
                                    {group.query || (group.linked || group.inferred || group.cachedSearch ? "Cadastru search" : fmtExternalApiService(group.service, group.events[0].endpoint))}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {group.linked || group.cachedSearch ? "Cadastru search" : group.inferred ? "Cadastru search (older logs)" : "Individual API log"}
                                  </p>
                                </td>
                                <td className="break-words px-4 py-3 text-gray-600">{[group.cachedSearch && "Cached", fmtExternalApiNodes(group.events)].filter(Boolean).join(", ")}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${group.mainFailure || group.cachedSearch?.result_type === "error" ? "bg-red-50 text-red-700" : group.failure ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                                    {group.mainFailure || group.cachedSearch?.result_type === "error" ? "Failed" : group.failure ? "With failures" : group.cachedSearch?.result_type === "no_data" ? "No result" : "Successful"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-gray-600">
                                  <p>{fmtNum(group.events.length)} {group.events.length === 1 ? "call" : "calls"}</p>
                                  <p className="mt-1 text-xs">
                                    {fmtNum(group.success)} successful · {fmtNum(group.mainFailure)} failed
                                    {group.failure > group.mainFailure && ` · ${fmtNum(group.failure - group.mainFailure)} other errors`}
                                  </p>
                                </td>
                                <td className="break-all px-4 py-3 text-gray-600"><AdminUserCell row={group} /></td>
                              </tr>
                              {expanded && (
                                <tr>
                                  <td colSpan={6} className="bg-sky-50/40 px-4 py-4">
                                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                      {group.events.length ? <ExternalApiEventTable
                                        rows={group.events}
                                        expandedExternalApiEventId={expandedExternalApiEventId}
                                        setExpandedExternalApiEventId={setExpandedExternalApiEventId}
                                        deletingExternalApiEventId={deletingExternalApiEventId}
                                        deleteExternalApiLogs={deleteExternalApiLogs}
                                      /> : <CadastruSearchDetails row={group.cachedSearch} />}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {showCalculatorUsageList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Calculator Usage</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.calculatorUsage?.periods?.["24h"])} in 24h · {fmtNum(s.calculatorUsage?.periods?.["7d"])} in 7 days · {fmtNum(s.calculatorUsage?.withTax)} with tax
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Avg price {fmtPrice(s.calculatorUsage?.averages?.apartmentPrice)} · Avg rent {fmtPrice(s.calculatorUsage?.averages?.monthlyRent)} · Avg yield {fmtPct(s.calculatorUsage?.averages?.grossYieldPct)}
              </p>
            </div>

            {!Array.isArray(s.calculatorUsage?.recent) || s.calculatorUsage.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No calculator usage found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Property</th>
                      <th className="px-4 py-3 text-right">Investment</th>
                      <th className="px-4 py-3 text-right">Rent</th>
                      <th className="px-4 py-3 text-right">Yield</th>
                      <th className="px-4 py-3 text-right">Payback</th>
                      <th className="px-4 py-3">Tax</th>
                      <th className="px-4 py-3">User</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.calculatorUsage.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          <div>{fmtCalculatorProperty(row)}</div>
                          <div className="mt-0.5 text-xs font-normal text-gray-500">
                            {[row.building_type, row.renovation].filter(Boolean).join(" · ") || "\u2014"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPrice(row.total_investment)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPrice(row.estimated_monthly_rent)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtPct(row.annual_gross_yield_pct)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                          {fmtYears(row.payback_years)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtBool(row.include_rent_tax)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          <AdminUserCell row={row} name={row.user_id || undefined} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showTelegramAlertsList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Telegram Alerts</h3>
            </div>

            {!Array.isArray(s.telegramAlerts) || s.telegramAlerts.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No Telegram alerts found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Alert</th>
                      <th className="px-4 py-3">Chat ID</th>
                      <th className="px-4 py-3">Base Filters</th>
                      <th className="px-4 py-3">Notification Filters</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Last Notified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.telegramAlerts.map((alert) => (
                      <tr key={alert.id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3 text-gray-900 font-medium min-w-48">
                          <div>{alert.label || "\u2014"}</div>
                          <div className="mt-0.5 text-xs font-normal text-gray-400">
                            <AdminUserCell row={alert} name={alert.user_id || "\u2014"} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {alert.telegram_chat_id || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 min-w-64">
                          {fmtFilterSummary(alert.base_filters, BASE_FILTER_LABELS)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 min-w-64">
                          {fmtFilterSummary(alert.alert_filters, ALERT_FILTER_LABELS)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${alert.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                              }`}
                          >
                            {alert.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {fmtDateTime(alert.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                          {fmtDateTime(alert.last_notified_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Tooltip from "@/components/Tooltip";
import ProfileCreditBalances from "@/components/ProfileCreditBalances";
import ProfileTransactionsTable from "@/components/ProfileTransactionsTable";

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

function fmtCadastruSearchType(type) {
  if (type === "address") return "Address";
  if (type === "number") return "Cadastral number";
  return type || "\u2014";
}

function fmtCadastruResultType(type) {
  if (type === "no_data") return "No data";
  if (type === "address_only") return "Address only";
  if (type === "apartment_only") return "Apartment only";
  if (type === "full_data") return "Full data";
  return type || "\u2014";
}

function fmtCadastruResultSummary(byResultType) {
  const counts = byResultType || {};
  const parts = [
    ["full_data", "full"],
    ["apartment_only", "apartment"],
    ["address_only", "address"],
    ["no_data", "none"],
  ]
    .map(([key, label]) => counts[key] ? `${fmtNum(counts[key])} ${label}` : null)
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "No result data yet";
}

function fmtCadastruSource(source) {
  if (source === "api") return "API";
  if (source === "local") return "Local";
  return source || "\u2014";
}

function fmtCadastruSourceSummary(byLookupSource) {
  const counts = byLookupSource || {};
  const parts = [
    ["api", "API"],
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
  return `999 ${fmtNum(listing999)} / cadastru ${fmtNum(cadastru)} · ${fmtNum(usage.failure)} failed`;
}

function fmtPaidUserSummary(paidUsers) {
  if (paidUsers?.available === false) return "Unavailable";
  const remaining = paidUsers?.remainingPaidCredits || 0;
  if (!remaining) return "No remaining paid credits";
  return `${fmtNum(remaining)} remaining credits`;
}

function fmtCheckoutSummary(item) {
  return `${fmtNum(item?.uniqueVisitors || 0)} users`;
}

function fmtExternalApiService(service) {
  if (service === "999_listing") return "999 listing";
  if (service === "cadastru_number") return "Cadastru number";
  if (service === "cadastru_address") return "Cadastru address";
  return service || "\u2014";
}

function groupExternalApiUsageRows(rows) {
  const grouped = new Map();

  for (const row of rows || []) {
    const key = `${row.usage_date || ""}|${row.service || ""}`;
    const item = grouped.get(key) || {
      usage_date: row.usage_date,
      service: row.service,
      success: 0,
      failure: 0,
      total: 0,
    };
    const count = Number(row.count) || 0;
    if (row.status === "success") item.success += count;
    if (row.status === "failure") item.failure += count;
    item.total += count;
    grouped.set(key, item);
  }

  return Array.from(grouped.values());
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

function StatCard({ label, value, detail, onClick, active = false }) {
  const cardClassName = `bg-white rounded-xl p-5 shadow-sm border transition-colors ${active
    ? "border-primary/40 ring-1 ring-primary/20"
    : "border-gray-100"
    }`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cardClassName} text-left hover:border-primary/40 hover:ring-1 hover:ring-primary/20 cursor-pointer`}
      >
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        {detail && <p className="mt-1 text-xs text-gray-400">{detail}</p>}
      </button>
    );
  }

  return (
    <div className={cardClassName}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-gray-400">{detail}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [dashboardPeriod, setDashboardPeriod] = useState("all");
  const [error, setError] = useState(null);
  const [showUsersList, setShowUsersList] = useState(false);
  const [showPaidUsersList, setShowPaidUsersList] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserTransactions, setSelectedUserTransactions] = useState([]);
  const [selectedUserTransactionsLoading, setSelectedUserTransactionsLoading] = useState(false);
  const [selectedUserPackageMenuOpen, setSelectedUserPackageMenuOpen] = useState(false);
  const [selectedUserPackageDraft, setSelectedUserPackageDraft] = useState("");
  const [selectedUserPackageSaving, setSelectedUserPackageSaving] = useState(false);
  const [selectedUserPackageError, setSelectedUserPackageError] = useState(null);
  const [selectedUserCreditResetConfirming, setSelectedUserCreditResetConfirming] = useState(false);
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
  const [showCalculatorUsageList, setShowCalculatorUsageList] = useState(false);
  const selectedUserPopupRef = useRef(null);

  const loadStats = useCallback(async ({ fresh = false } = {}) => {
    if (fresh) setStatsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ period: dashboardPeriod });
      if (fresh) params.set("fresh", "1");
      const res = await fetch(`/api/admin/stats?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err.message || "Failed to load stats");
    } finally {
      setLoading(false);
      setStatsRefreshing(false);
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
  }, [selectedUser?.id, selectedUser?.packageKey]);

  useEffect(() => {
    if (!selectedUser) return undefined;

    const handlePointerDown = (event) => {
      if (selectedUserPopupRef.current?.contains(event.target)) return;
      setSelectedUser(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [selectedUser]);

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
    if (!selectedUser?.id || !selectedUserPackageDraft || selectedUserPackageDraft === selectedUser.packageKey) return;

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
        credits: Array.isArray(data.credits) ? data.credits : selectedUser.credits,
        freeMonthlyCredits: data.packageKey === "free" ? selectedUser.freeMonthlyCredits : [],
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
    if (!selectedUser?.id || !selectedUser.packageKey) return;

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
        credits: Array.isArray(data.credits) ? data.credits : selectedUser.credits,
        freeMonthlyCredits: data.packageKey === "free" ? selectedUser.freeMonthlyCredits : [],
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
    setDashboardPeriod(period);
    setActiveEstimationsType(null);
    setEstimations([]);
  };

  const deleteCadastruSearch = async (row) => {
    if (!row?.id) return;
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
      await loadStats({ fresh: true });
    } catch (err) {
      setCadastruSearchDeleteError(err.message || "Failed to delete cadastru search");
    } finally {
      setDeletingCadastruSearchId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !stats) {
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

  return (
    <div className="space-y-8">
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-4 sm:py-6">
          <div ref={selectedUserPopupRef} className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedUser.name || "\u2014"}</h2>
                {selectedUser.email && <p className="mt-0.5 text-sm text-gray-500">{selectedUser.email}</p>}
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
                            disabled={selectedUserPackageSaving}
                            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:text-gray-400"
                          >
                            Anulează
                          </button>
                          <button
                            type="button"
                            onClick={saveSelectedUserPackage}
                            disabled={selectedUserPackageSaving}
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
                      <p className="text-xs font-medium text-gray-700">Resetezi utilizările pentru pachetul curent?</p>
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserCreditResetConfirming(false);
                            setSelectedUserCreditResetError(null);
                          }}
                          disabled={selectedUserCreditResetSaving}
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:text-gray-400"
                        >
                          Anulează
                        </button>
                        <button
                          type="button"
                          onClick={resetSelectedUserCredits}
                          disabled={selectedUserCreditResetSaving}
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
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-sm font-medium text-gray-500 hover:bg-gray-50"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-5">
              <ProfileCreditBalances
                credits={selectedUser.credits || []}
                freeMonthlyCredits={selectedUser.freeMonthlyCredits || []}
                isDarkMode
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

      {/* Users & App Usage */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Users & App Usage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-12 gap-4">
          <StatCard
            label="Registered Users"
            value={fmtNum(s.totalUsers)}
            detail={showUsersList ? "Click to hide list" : "Click to view all users"}
            onClick={toggleUsersList}
            active={showUsersList}
          />
          <StatCard
            label="Paid Users"
            value={fmtNum(s.paidUsers?.totalPaidUsers || 0)}
            detail={showPaidUsersList ? "Click to hide list" : fmtPaidUserSummary(s.paidUsers)}
            onClick={() => setShowPaidUsersList((value) => !value)}
            active={showPaidUsersList}
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
            label="Prețuri actuale Popup"
            value={s.marketTrendsPopup?.available === false ? "—" : fmtNum(s.marketTrendsPopup?.total)}
            detail={s.marketTrendsPopup?.available === false ? "Apply market trends popup SQL" : "Popup opens"}
          />
          <StatCard
            label="Sale Estimations"
            value={fmtNum(s.totalSaleEstimations ?? s.totalEstimations)}
            detail={activeEstimationsType === "sale" ? "Click to hide list" : "Click to view recent sale estimations"}
            onClick={() => toggleEstimationsList("sale")}
            active={activeEstimationsType === "sale"}
          />
          <StatCard
            label="Rent Estimations"
            value={fmtNum(s.totalRentEstimations)}
            detail={activeEstimationsType === "rent" ? "Click to hide list" : "Click to view recent rent estimations"}
            onClick={() => toggleEstimationsList("rent")}
            active={activeEstimationsType === "rent"}
          />
          <StatCard
            label="Cadastru Searches"
            value={fmtNum(s.cadastruSearches?.total)}
            detail={showCadastruSearchesList ? "Click to hide list" : fmtCadastruResultSummary(s.cadastruSearches?.byResultType)}
            onClick={() => setShowCadastruSearchesList((value) => !value)}
            active={showCadastruSearchesList}
          />
          <StatCard
            label="999 Link Analyses"
            value={fmtNum(s.listingLinkAnalyses?.total)}
            detail={showListingLinkAnalysesList ? "Click to hide list" : `${fmtNum(s.listingLinkAnalyses?.success)} analyzed / ${fmtNum(s.listingLinkAnalyses?.unsupported)} rejected`}
            onClick={() => setShowListingLinkAnalysesList((value) => !value)}
            active={showListingLinkAnalysesList}
          />
          <StatCard
            label="Calculator Usage"
            value={fmtNum(s.calculatorUsage?.total)}
            detail={showCalculatorUsageList ? "Click to hide list" : `${fmtNum(s.calculatorUsage?.registered)} registered / ${fmtNum(s.calculatorUsage?.anonymous)} anonymous`}
            onClick={() => setShowCalculatorUsageList((value) => !value)}
            active={showCalculatorUsageList}
          />
          <StatCard
            label="PDF Reports"
            value={fmtNum(s.pdfGeneration?.total)}
            detail={showPdfGenerationList ? "Click to hide list" : `${fmtNum(s.pdfGeneration?.registered)} registered / ${fmtNum(s.pdfGeneration?.anonymous)} anonymous`}
            onClick={() => setShowPdfGenerationList((value) => !value)}
            active={showPdfGenerationList}
          />
          <StatCard label="Shared Links" value={fmtNum(s.totalSharedLinks)} />
          <StatCard label="Favorites" value={fmtNum(s.totalFavorites)} />
          <StatCard
            label="Telegram Alerts"
            value={fmtNum(s.totalTelegramAlerts)}
            detail={showTelegramAlertsList ? "Click to hide list" : "Click to view alerts"}
            onClick={() => setShowTelegramAlertsList((value) => !value)}
            active={showTelegramAlertsList}
          />
          <StatCard
            label="External API"
            value={fmtNum(s.externalApiUsage?.total)}
            detail={showExternalApiUsageList ? "Click to hide details" : fmtExternalApiUsageSummary(s.externalApiUsage)}
            onClick={() => setShowExternalApiUsageList((value) => !value)}
            active={showExternalApiUsageList}
          />
        </div>
        {showPaidUsersList && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Paid Users</h3>
            </div>

            {s.paidUsers?.available === false ? (
              <div className="px-5 py-8 text-center text-amber-600">Paid user data is unavailable</div>
            ) : !Array.isArray(s.paidUsers?.users) || s.paidUsers.users.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No paid users found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase [&>*+*]:border-l [&>*+*]:border-gray-100">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Registered Date</th>
                      <th className="px-4 py-3">Latest Payment</th>
                      <th className="px-4 py-3">Latest Product</th>
                      <th className="px-4 py-3 text-right">Remaining Credits</th>
                      <th className="px-4 py-3 text-right">Paid Orders</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.paidUsers.users.map((user) => (
                      <tr key={user.userId} className="hover:bg-gray-50 [&>*+*]:border-l [&>*+*]:border-gray-100">
                        <td className="px-4 py-3 text-gray-900 font-medium">{user.name || user.userId}</td>
                        <td className="px-4 py-3 text-gray-600">{user.email || "\u2014"}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(user.registeredAt)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDateTime(user.latestPaidAt)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {PAYMENT_PRODUCT_LABELS_RO[user.latestProductKey] || user.latestProductKey || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmtNum(user.remainingPaidCredits)}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fmtNum(user.paidOrders)}</td>
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
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase [&>*+*]:border-l [&>*+*]:border-gray-100">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Package</th>
                      <th className="px-4 py-3">Registered Type</th>
                      <th className="px-4 py-3">Registered Date</th>
                      <th className="px-4 py-3">Last Visit</th>
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
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 [&>*+*]:border-l [&>*+*]:border-gray-100">
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          <button
                            type="button"
                            onClick={() => setSelectedUser(u)}
                            className="text-left font-medium text-primary hover:underline"
                          >
                            {u.name || "\u2014"}
                          </button>
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
                          {fmtNum(u.cadastruSearches)}
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
                          {row.isAnonymous ? "Anonymous" : row.userName || "\u2014"}
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
                          {row.user_id || "Anonymous"}
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
                {fmtNum(s.cadastruSearches?.periods?.["24h"])} in 24h · {fmtNum(s.cadastruSearches?.periods?.["7d"])} in 7 days · {fmtNum(s.cadastruSearches?.registered)} registered / {fmtNum(s.cadastruSearches?.anonymous)} anonymous
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

            {!Array.isArray(s.cadastruSearches?.recent) || s.cadastruSearches.recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400">No cadastru searches found</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Cadastral number</th>
                      <th className="px-4 py-3">District</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.cadastruSearches.recent.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {fmtDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {fmtCadastruSearchType(row.search_type)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtCadastruResultType(row.result_type)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtCadastruSource(row.lookup_source)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {row.cadastral_number || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.district || "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 break-all">
                          {row.user_name || "Anonymous"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => deleteCadastruSearch(row)}
                            disabled={deletingCadastruSearchId === row.id}
                            className="cursor-pointer rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-default disabled:text-red-300"
                          >
                            {deletingCadastruSearchId === row.id ? "Deleting..." : "Delete"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                          {row.user_id || "Anonymous"}
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
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">External API Usage</h3>
              <p className="mt-1 text-xs text-gray-500">
                {fmtNum(s.externalApiUsage?.success)} successful · {fmtNum(s.externalApiUsage?.failure)} failed
              </p>
            </div>

            {!s.externalApiUsage?.total ? (
              <div className="px-5 py-8 text-center text-gray-400">No external API calls found</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 border-b border-gray-100">
                  {Object.entries(s.externalApiUsage.byService || {}).map(([service, item]) => (
                    <div key={service} className="px-5 py-4 md:border-r md:last:border-r-0 border-gray-100">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {fmtExternalApiService(service)}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{fmtNum(item.total)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {fmtNum(item.success)} successful · {fmtNum(item.failure)} failed
                      </p>
                    </div>
                  ))}
                </div>
                {groupExternalApiUsageRows(s.externalApiUsage.recent).length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400">No recent external API rows found</div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0">
                        <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Service</th>
                          <th className="px-4 py-3 text-right">Success</th>
                          <th className="px-4 py-3 text-right">Failure</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {groupExternalApiUsageRows(s.externalApiUsage.recent).map((row) => (
                          <tr key={`${row.usage_date}-${row.service}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {fmtDate(row.usage_date)}
                            </td>
                            <td className="px-4 py-3 text-gray-900 font-medium">
                              {fmtExternalApiService(row.service)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {fmtNum(row.success)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {fmtNum(row.failure)}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {fmtNum(row.total)}
                            </td>
                          </tr>
                        ))}
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
                          {row.user_id || "Anonymous"}
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
                            {alert.user_id || "\u2014"}
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

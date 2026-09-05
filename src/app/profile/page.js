"use client";

import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookmarkIcon from "@/components/icons/BookmarkIcon";
import HistoryIcon from "@/components/icons/HistoryIcon";
import Tooltip from "@/components/Tooltip";
import ProfileCreditBalances from "@/components/ProfileCreditBalances";
import ProfileTransactionsTable from "@/components/ProfileTransactionsTable";
import { formatLocalizedDate } from "@/lib/localized-date";

const HISTORY_PAGE_SIZE = 10;
const TRANSACTIONS_PAGE_SIZE = 10;
const PACKAGE_PRODUCT_KEYS = ["extra_pack", "pro_pack", "standard_pack"];
const CREDIT_FEATURE_LABEL_KEYS = {
  sale_estimate: "pricing.featureSale",
  rent_estimate: "pricing.featureRent",
  listing_analysis: "pricing.feature999",
  cadastru_lookup: "pricing.featureCadastru",
  yield_calculator: "pricing.featureYield",
  pdf_report: "pricing.featurePdf",
};
function formatNumber(value, lang, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString(lang === "ru" ? "ru-RU" : "ro-RO", options);
}

function formatHistoryDate(value, lang) {
  if (!value) return "—";
  const datePart = formatLocalizedDate(value, lang, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timePart = formatLocalizedDate(value, lang, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function formatHistoryPrice(amount, lang) {
  if (amount == null) return "—";
  return `${formatNumber(amount, lang, { maximumFractionDigits: 0 })} €`;
}

function formatRoomValue(value, t) {
  return Number(value) === 1
    ? t("result.oneRoom")
    : t("result.rooms", { count: value });
}

function translateDataValue(prefix, value, t) {
  if (!value) return null;
  const key = `${prefix}.${value}`;
  const translated = t(key);
  return translated === key ? value : translated;
}

function translateDataValues(prefix, values, t) {
  const list = Array.isArray(values) ? values : [values];
  return list
    .filter(Boolean)
    .map((value) => translateDataValue(prefix, value, t))
    .filter(Boolean)
    .join(", ");
}

function formatHistoryProperty(row, t, lang) {
  return [
    row.roomsCount ? formatRoomValue(row.roomsCount, t) : null,
    row.areaM2 ? `${formatNumber(row.areaM2, lang, { maximumFractionDigits: 0 })} m²` : null,
    translateDataValues("data.district", row.districts?.length ? row.districts : row.district, t),
    translateDataValue("data.city", row.city, t),
  ].filter(Boolean).join(" · ") || "—";
}

function formatHistoryPropertyDetails(row, t) {
  if (row.type === "cadastru") {
    return [
      row.searchType ? t(`profile.historyCadastruSearchType.${row.searchType}`) : null,
      row.resultType ? t(`profile.historyCadastruResultType.${row.resultType}`) : null,
      translateDataValue("data.city", row.city, t),
      translateDataValue("data.district", row.district, t),
    ].filter(Boolean).join(" · ") || "—";
  }

  return [
    translateDataValues("data.buildingType", row.buildingTypes?.length ? row.buildingTypes : row.buildingType, t),
    translateDataValue("data.renovationType", row.renovation, t),
  ].filter(Boolean).join(" · ") || "—";
}

function formatHistoryResult(row, lang) {
  if (row.type === "cadastru") return row.cadastralNumber || "—";
  return formatHistoryPrice(row.estimatedPrice, lang);
}

function formatHistoryType(row, t) {
  if (row.type === "cadastru") return t("profile.historyTypeCadastru");
  return row.estimateType === "rent"
    ? t("profile.historyTypeRentEstimate")
    : t("profile.historyTypeEstimate");
}

function formatPaymentProduct(productKey, t) {
  const key = `profile.paymentProduct.${productKey}`;
  const translated = t(key);
  return translated === key ? productKey || "—" : translated;
}

function formatPaymentStatus(status, t) {
  const key = `profile.paymentStatus.${status}`;
  const translated = t(key);
  return translated === key ? t("payment.orderStatusUnknown") : translated;
}

function formatCreditFeature(featureKey, t) {
  const key = CREDIT_FEATURE_LABEL_KEYS[featureKey];
  return key ? t(key) : featureKey || "—";
}

function getProfileAccessBadge({ transactions, credits, creditsLoading, t }) {
  if (creditsLoading) {
    return { label: t("profile.accessChecking"), tone: "neutral" };
  }

  const paidPackage = (transactions || []).find((row) =>
    row.status === "paid" && PACKAGE_PRODUCT_KEYS.includes(row.productKey)
  );
  if (paidPackage) {
    return { label: formatPaymentProduct(paidPackage.productKey, t), tone: "paid" };
  }

  const hasPaidCredit = (credits || []).some((row) => Number(row.remainingUses) > 0);
  if (hasPaidCredit) {
    return { label: t("profile.accessPaid"), tone: "paid" };
  }

  return { label: t("profile.accessFree"), tone: "free" };
}

function isManagedTelegramEmail(email) {
  return /^telegram-\d+@auth\.catdai\.md$/i.test(String(email || ""));
}

function getProfileName(user) {
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.name || "User";
}

function getProfileSubtitle(user) {
  const username = user?.user_metadata?.user_name || user?.user_metadata?.preferred_username;
  if (username) return `@${username}`;
  return isManagedTelegramEmail(user?.email) ? null : user?.email;
}

function getProfileInitial(user) {
  const label = getProfileName(user) || getProfileSubtitle(user) || user?.email || "U";
  return label.charAt(0).toUpperCase();
}

export default function ProfilePage() {
  const { t, lang } = useTranslation();
  const { user, session, signOut, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelSubscriptionModalOpen, setIsCancelSubscriptionModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("favorites");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);
  const [transactionsNextCursor, setTransactionsNextCursor] = useState(null);
  const [credits, setCredits] = useState([]);
  const [freeMonthlyCredits, setFreeMonthlyCredits] = useState([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [extraSubscription, setExtraSubscription] = useState(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [subscriptionCanceling, setSubscriptionCanceling] = useState(false);
  const profileName = getProfileName(user);
  const profileSubtitle = getProfileSubtitle(user);
  const accessBadge = getProfileAccessBadge({ transactions, credits, creditsLoading, t });

  useEffect(() => {
    document.title = `${t("nav.profile")} | Catdai`;
  }, [t]);

  const handleDeleteProfile = async () => {
    try {
      setIsDeleting(true);
      const res = await fetch('/api/profile/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        }
      });

      if (res.ok) {
        await signOut();
        router.push("/");
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete profile');
        setIsDeleting(false);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to server');
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/");
    }
  }, [loading, isAuthenticated, router]);

  const fetchHistoryPage = async ({ cursor, append = false } = {}) => {
    if (!session?.access_token) return;

    if (append) {
      setHistoryLoadingMore(true);
    } else {
      setHistoryLoading(true);
    }

    try {
      const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/profile/history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (append) {
        setHistory((prev) => [...prev, ...(data.history || [])]);
      } else {
        setHistory(data.history || []);
      }
      setHistoryNextCursor(data.nextCursor || null);
    } catch {
      if (!append) {
        setHistory([]);
        setHistoryNextCursor(null);
      }
    } finally {
      setHistoryLoading(false);
      setHistoryLoadingMore(false);
    }
  };

  const fetchTransactionsPage = async ({ cursor, append = false } = {}) => {
    if (!session?.access_token) return;

    if (append) {
      setTransactionsLoadingMore(true);
    } else {
      setTransactionsLoading(true);
    }

    try {
      const params = new URLSearchParams({ limit: String(TRANSACTIONS_PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/profile/transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (append) {
        setTransactions((prev) => [...prev, ...(data.transactions || [])]);
      } else {
        setTransactions(data.transactions || []);
      }
      setTransactionsNextCursor(data.nextCursor || null);
    } catch {
      if (!append) {
        setTransactions([]);
        setTransactionsNextCursor(null);
      }
    } finally {
      setTransactionsLoading(false);
      setTransactionsLoadingMore(false);
    }
  };

  const handleCancelExtraSubscription = async () => {
    if (!session?.access_token || !extraSubscription?.id) return;

    setSubscriptionCanceling(true);
    try {
      const res = await fetch("/api/profile/subscription", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to cancel subscription.");
      setExtraSubscription(data.subscription || null);
      setIsCancelSubscriptionModalOpen(false);
    } catch (error) {
      alert(error?.message || t("profile.cancelExtraSubscriptionError"));
    } finally {
      setSubscriptionCanceling(false);
    }
  };

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${session.access_token}` };

    Promise.all([
      fetch("/api/favorites", { headers }).then((res) => res.json()),
      fetch(`/api/profile/history?limit=${HISTORY_PAGE_SIZE}`, { headers }).then((res) => res.json()),
      fetch(`/api/profile/transactions?limit=${TRANSACTIONS_PAGE_SIZE}`, { headers }).then((res) => res.json()),
      fetch("/api/profile/credits", { headers }).then((res) => res.json()),
      fetch("/api/profile/subscription", { headers }).then((res) => res.json()),
    ])
      .then(([favoritesData, historyData, transactionsData, creditsData, subscriptionData]) => {
        if (cancelled) return;
        setFavorites(favoritesData.favorites || []);
        setHistory(historyData.history || []);
        setHistoryNextCursor(historyData.nextCursor || null);
        setTransactions(transactionsData.transactions || []);
        setTransactionsNextCursor(transactionsData.nextCursor || null);
        setCredits(creditsData.credits || []);
        setFreeMonthlyCredits(creditsData.freeMonthlyCredits || []);
        setExtraSubscription(subscriptionData.subscription || null);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setFavoritesLoading(false);
        setHistoryLoading(false);
        setTransactionsLoading(false);
        setCreditsLoading(false);
        setSubscriptionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const handleRemoveFavorite = async (urlPath) => {
    setFavorites((prev) => prev.filter((f) => f.url_path !== urlPath));
    try {
      await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url_path: urlPath }),
      });
    } catch {
      // Silently fail — the item is already removed from UI
    }
  };

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1 flex justify-center flex-col gap-4 items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          <p className="text-gray-600 text-sm">{t("auth.loading", "Loading...")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 min-h-[60vh]">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">{t("nav.profile")}</h1>
          <div className="bg-white shadow rounded-lg p-8 border border-gray-100 relative">
            <button
              type="button"
              onClick={() => router.push("/pricing")}
              className={`absolute right-6 top-6 cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
              accessBadge.tone === "paid"
                ? "border-primary/20 bg-primary/10 text-primary-dark hover:bg-primary/15"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
            >
              {accessBadge.label}
            </button>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              {user?.user_metadata?.avatar_url || user?.user_metadata?.picture ? (
                <img 
                  src={user.user_metadata.avatar_url || user.user_metadata.picture} 
                  alt="Profile" 
                  className="h-20 w-20 rounded-full object-cover border border-gray-200 shadow-sm"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-20 w-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl shadow-sm">
                  {getProfileInitial(user)}
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{profileName}</h2>
                {profileSubtitle && <p className="text-gray-600 mb-4">{profileSubtitle}</p>}
                <button
                  type="button"
                  onClick={async () => {
                    await signOut();
                    router.push("/");
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md text-sm font-medium transition-colors border border-gray-200"
                >
                  {t("profile.logout", "Logout")}
                </button>
              </div>
            </div>
            <div className="mt-8 border-t border-gray-100 pt-6">
              <ProfileCreditBalances
                credits={credits}
                freeMonthlyCredits={freeMonthlyCredits}
                loading={creditsLoading}
                labels={{
                  title: t("profile.creditBalances"),
                  description: t("profile.creditBalanceDesc"),
                  remaining: t("profile.creditRemaining"),
                  freeBadge: t("profile.creditBadgeFree"),
                  used: ({ used, total }) => t("profile.creditUsed", { used, total }),
                  feature: (featureKey) => formatCreditFeature(featureKey, t),
                }}
                formatValue={(value) => formatNumber(value, lang, { maximumFractionDigits: 0 })}
                className="mb-6"
                isDarkMode={false}
              />
              {extraSubscription && (
                <div className="mb-6 rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">
                    {t("profile.extraSubscriptionTitle")}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {extraSubscription.cancelAtPeriodEnd
                      ? t("profile.extraSubscriptionCancelScheduled", {
                          date: formatHistoryDate(extraSubscription.currentPeriodEnd, lang),
                        })
                      : t("profile.extraSubscriptionActive", {
                          date: formatHistoryDate(extraSubscription.currentPeriodEnd, lang),
                        })}
                  </p>
                  {!extraSubscription.cancelAtPeriodEnd && (
                    <button
                      type="button"
                      onClick={() => setIsCancelSubscriptionModalOpen(true)}
                      disabled={subscriptionCanceling || subscriptionLoading}
                      className="mt-3 cursor-pointer rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {subscriptionCanceling
                        ? t("profile.cancelExtraSubscriptionLoading")
                        : t("profile.cancelExtraSubscription")}
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left text-lg font-medium text-gray-900 transition-colors hover:text-primary"
                aria-expanded={isSettingsOpen}
                aria-controls="profile-settings-panel"
                onClick={() => setIsSettingsOpen((value) => !value)}
              >
                <span>{t("profile.config")}</span>
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 text-gray-400 transition-transform ${isSettingsOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div
                id="profile-settings-panel"
                className={`mt-4 ${isSettingsOpen ? "block" : "hidden"}`}
              >
                <button
                  type="button"
                  className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-sm font-medium transition-colors border border-red-200"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  {t("profile.delete")}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-4 flex gap-2 overflow-x-auto rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab("favorites")}
                className={`flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-1 ${activeTab === "favorites"
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <BookmarkIcon size={18} filled={activeTab === "favorites"} />
                {t("profile.favorites")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-1 ${activeTab === "history"
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <HistoryIcon size={18} />
                {t("profile.history")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("transactions")}
                className={`flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-1 ${activeTab === "transactions"
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                <span className="text-base" aria-hidden="true">€</span>
                {t("profile.transactions")}
              </button>
            </div>

            {activeTab === "favorites" && (
              <section>
                <h3 className="mb-4 text-lg font-semibold text-gray-900">{t("profile.favorites")}</h3>
                {favoritesLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
                  </div>
                ) : favorites.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">{t("profile.noFavorites")}</p>
                ) : (
                  <div className="space-y-2">
                    {favorites.map((fav) => (
                      <div
                        key={fav.id}
                        className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50 group"
                      >
                        <a
                          href={fav.url_path}
                          className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 transition-colors hover:text-primary"
                        >
                          {fav.label || fav.url_path}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveFavorite(fav.url_path)}
                          className="shrink-0 rounded-lg p-1.5 text-primary opacity-0 transition-colors hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                          title={t("result.removeFavorite")}
                        >
                          <BookmarkIcon size={16} filled />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === "history" && (
              <section>
                {historyLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">{t("profile.noHistory")}</p>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                            <th className="px-4 py-3">{t("profile.historyDate")}</th>
                            <th className="px-4 py-3">{t("profile.historyType")}</th>
                            <th className="px-4 py-3">{t("profile.historyProperty")}</th>
                            <th className="px-4 py-3 text-right">{t("profile.historyResult")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {history.map((row) => {
                            const href = row.type === "cadastru" && row.cadastralNumber && row.resultType !== "no_data"
                              ? `/${lang}/cadastru/rezultat?cadastral_number=${encodeURIComponent(row.cadastralNumber)}`
                              : row.href;
                            const isClickable = Boolean(href);
                            return (
                              <tr
                                key={row.id}
                                className={`hover:bg-gray-50 ${isClickable ? "cursor-pointer focus-within:bg-gray-50" : ""}`}
                                tabIndex={isClickable ? 0 : undefined}
                                onClick={isClickable ? () => router.push(href) : undefined}
                                onKeyDown={isClickable ? (event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    router.push(href);
                                  }
                                } : undefined}
                              >
                                <td className={`whitespace-nowrap border-l-4 px-4 py-3 text-gray-600 ${row.isSnapshot ? "border-emerald-500 bg-emerald-50/40" : "border-transparent"}`}>
                                  {row.isSnapshot ? (
                                    <Tooltip text={t("profile.paidSnapshotTooltip")}>
                                      <span className="font-medium text-emerald-700">
                                        {formatHistoryDate(row.createdAt, lang)}
                                      </span>
                                    </Tooltip>
                                  ) : (
                                    formatHistoryDate(row.createdAt, lang)
                                  )}
                                </td>
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {formatHistoryType(row, t)}
                                </td>
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  <div>
                                    {row.type === "cadastru"
                                      ? t("profile.historyTypeCadastru")
                                      : formatHistoryProperty(row, t, lang)}
                                  </div>
                                  <div className="mt-0.5 text-xs font-normal text-gray-500">
                                    {formatHistoryPropertyDetails(row, t)}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">
                                  {formatHistoryResult(row, lang)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {historyNextCursor && (
                      <div className="border-t border-gray-100 px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => fetchHistoryPage({ cursor: historyNextCursor, append: true })}
                          disabled={historyLoadingMore}
                          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          {historyLoadingMore ? t("profile.historyLoadingMore") : t("profile.historyLoadMore")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {activeTab === "transactions" && (
              <section>
                {transactionsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
                  </div>
                ) : (
                  <ProfileTransactionsTable
                    transactions={transactions}
                    lang={lang}
                    labels={{
                      empty: t("profile.noTransactions"),
                      paymentDate: t("profile.paymentDate"),
                      paymentProduct: t("profile.paymentProduct"),
                      paymentStatus: t("profile.paymentStatus"),
                      paymentAmount: t("profile.paymentAmount"),
                      paymentTransactionId: t("profile.paymentTransactionId"),
                      paymentOrderId: t("profile.paymentOrderId"),
                      loadMore: t("profile.historyLoadMore"),
                      loadingMore: t("profile.historyLoadingMore"),
                    }}
                    formatProduct={(productKey) => formatPaymentProduct(productKey, t)}
                    formatStatus={(status) => formatPaymentStatus(status, t)}
                    nextCursor={transactionsNextCursor}
                    loadingMore={transactionsLoadingMore}
                    onLoadMore={(cursor) => fetchTransactionsPage({ cursor, append: true })}
                  />
                )}
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {t("profile.delete")}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {t("profile.confirmDelete")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                {t("form.back")}
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                onClick={handleDeleteProfile}
                disabled={isDeleting}
              >
                {isDeleting && (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                {t("profile.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCancelSubscriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {t("profile.cancelExtraSubscription")}
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {t("profile.cancelExtraSubscriptionConfirm")}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setIsCancelSubscriptionModalOpen(false)}
                disabled={subscriptionCanceling}
              >
                {t("form.back")}
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleCancelExtraSubscription}
                disabled={subscriptionCanceling}
              >
                {subscriptionCanceling && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {subscriptionCanceling
                  ? t("profile.cancelExtraSubscriptionLoading")
                  : t("profile.cancelExtraSubscription")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

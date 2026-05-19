"use client";

import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ConfigIcon from "@/components/icons/ConfigIcon";
import { ArrowLeft } from "@/components/icons/ArrowsIcons";
import BookmarkIcon from "@/components/icons/BookmarkIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { TELEGRAM_ALERTS_BOT_HANDLE, TELEGRAM_ALERTS_BOT_URL } from "../../../db/constants";

function formatDate(value, lang) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "numeric", month: "short", year: "numeric" }
  );
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("ro-MD");
}

function isEmptyRoomValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function formatRoomValue(value, t) {
  return Number(value) === 1
    ? t("result.oneRoom")
    : t("result.rooms", { count: value });
}

function formatRooms(value, t) {
  if (isEmptyRoomValue(value)) return null;
  if (Array.isArray(value)) {
    return value.map((roomValue) => formatRoomValue(roomValue, t)).join(", ");
  }

  return formatRoomValue(value, t);
}

function formatAlertFilter(key, value, t) {
  if (value === null || value === undefined || value === "" || value === false) return null;

  switch (key) {
    case "price_min":
      return `${t("result.priceFrom")}: €${formatNumber(value)}`;
    case "price_max":
      return `${t("result.priceTo")}: €${formatNumber(value)}`;
    case "max_price_per_m2":
      return `${t("result.maxPricePerM2")}: €${formatNumber(value)}`;
    case "area_min":
      return `${t("alerts.areaFrom")}: ${formatNumber(value)}m²`;
    case "area_max":
      return `${t("alerts.areaTo")}: ${formatNumber(value)}m²`;
    case "floor_min":
      return `${t("result.floorFrom")}: ${formatNumber(value)}`;
    case "floor_max":
      return `${t("result.floorTo")}: ${formatNumber(value)}`;
    case "first_floor":
      return t("result.floorOption.first");
    case "last_floor":
      return t("result.floorOption.last");
    case "seller_type":
      return `${t("result.sellerTypeFilter")}: ${t(`result.sellerType.${value}`)}`;
    default:
      return null;
  }
}

function buildAlertChips(alert, t) {
  const filters = alert?.alert_filters || {};
  return Object.entries(filters)
    .map(([key, value]) => formatAlertFilter(key, value, t))
    .filter(Boolean);
}

function buildBaseSummary(alert, t) {
  const filters = alert?.base_filters || {};
  return [
    filters.city ? t(`data.city.${filters.city}`) : null,
    filters.district ? t(`data.district.${filters.district}`) : null,
    formatRooms(filters.rooms_count, t),
    filters.area_m2 ? `${formatNumber(filters.area_m2)}m²` : null,
    filters.building_type ? t(`data.buildingType.${filters.building_type}`) : null,
    filters.renovation ? t(`data.renovationType.${filters.renovation}`) : null,
  ].filter(Boolean).join(" · ");
}

export default function ProfilePage() {
  const { t, lang } = useTranslation();
  const { user, session, signOut, isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [alertDeleteTarget, setAlertDeleteTarget] = useState(null);
  const [isDeletingAlert, setIsDeletingAlert] = useState(false);
  const [activeTab, setActiveTab] = useState("favorites");
  const [favorites, setFavorites] = useState([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [listingAlerts, setListingAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [telegramConnection, setTelegramConnection] = useState(null);
  const [isTelegramLinking, setIsTelegramLinking] = useState(false);
  const [telegramLinkError, setTelegramLinkError] = useState("");

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

  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${session.access_token}` };

    Promise.all([
      fetch("/api/favorites", { headers }).then((res) => res.json()),
      fetch("/api/listing-alerts", { headers }).then((res) => res.json()),
      fetch("/api/telegram-link", { headers }).then((res) => res.json()),
    ])
      .then(([favoritesData, alertsData, telegramData]) => {
        if (cancelled) return;
        setFavorites(favoritesData.favorites || []);
        setListingAlerts(alertsData.alerts || []);
        setTelegramConnection(telegramData.connection || null);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setFavoritesLoading(false);
        setAlertsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const handleConnectTelegram = async () => {
    if (!session?.access_token || isTelegramLinking) return;

    setIsTelegramLinking(true);
    setTelegramLinkError("");

    try {
      const res = await fetch("/api/telegram-link", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to create Telegram link");
      }

      const url = data.url || TELEGRAM_ALERTS_BOT_URL;
      if (url && typeof window !== "undefined") {
        window.location.assign(url);
      }
    } catch (error) {
      setTelegramLinkError(error?.message || "Failed to create Telegram link");
    } finally {
      setIsTelegramLinking(false);
    }
  };

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

  const handleDeleteListingAlert = async () => {
    if (!alertDeleteTarget) return;
    const alertId = alertDeleteTarget.id;
    setIsDeletingAlert(true);
    setListingAlerts((prev) => prev.filter((item) => item.id !== alertId));
    try {
      await fetch("/api/listing-alerts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: alertId }),
      });
    } catch {
      // Silently fail — the item is already removed from UI
    } finally {
      setIsDeletingAlert(false);
      setAlertDeleteTarget(null);
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
            <div 
              className="absolute top-6 right-6 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setIsConfigOpen(!isConfigOpen)}
            >
              {isConfigOpen ? <ArrowLeft size={24} /> : <ConfigIcon size={24} />}
            </div>
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
                  {user?.user_metadata?.full_name?.charAt(0).toUpperCase() || user?.user_metadata?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{user?.user_metadata?.full_name || user?.user_metadata?.name || user?.name || "User"}</h2>
                <p className="text-gray-600 mb-4">{user?.email}</p>
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
            {isConfigOpen && (
              <div className="mt-8 pt-8 border-t border-gray-100">
                <h3 className="text-lg font-medium text-gray-900 mb-4">{t("profile.config")}</h3>
                <div className="mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{t("profile.telegramConnect")}</p>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {telegramConnection?.telegram_username
                          ? `@${telegramConnection.telegram_username}`
                          : `t.me/${TELEGRAM_ALERTS_BOT_HANDLE}`}
                      </p>
                    </div>
                    <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${telegramConnection
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-gray-100 text-gray-500"
                    }`}>
                      {telegramConnection ? t("profile.telegramConnected") : t("profile.telegramNotConnected")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectTelegram}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <TelegramIcon size={16} />
                    <span>
                      {isTelegramLinking
                        ? t("profile.telegramLinking")
                        : telegramConnection
                          ? t("profile.telegramReconnect")
                          : t("profile.telegramConnect")}
                    </span>
                  </button>
                  {telegramLinkError && (
                    <p className="mt-2 text-xs text-red-600">{telegramLinkError}</p>
                  )}
                </div>
                <button 
                  type="button"
                  className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-md text-sm font-medium transition-colors border border-red-200"
                  onClick={() => setIsDeleteModalOpen(true)}
                >
                  {t("profile.delete")}
                </button>
              </div>
            )}
          </div>

          <div className="mt-8">
            <div className="mb-4 flex gap-2 rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab("favorites")}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === "favorites"
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                {t("profile.favorites")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("alerts")}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === "alerts"
                  ? "bg-primary text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
              >
                {t("profile.alerts")}
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

            {activeTab === "alerts" && (
              <section>
                <h3 className="mb-4 text-lg font-semibold text-gray-900">{t("profile.alerts")}</h3>
                {alertsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
                  </div>
                ) : listingAlerts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-400">{t("profile.noAlerts")}</p>
                ) : (
                  <div className="space-y-3">
                    {listingAlerts.map((listingAlert) => {
                      const baseSummary = buildBaseSummary(listingAlert, t);
                      const alertChips = buildAlertChips(listingAlert, t);
                      const createdAt = formatDate(listingAlert.created_at, lang);
                      const lastNotifiedAt = formatDate(listingAlert.last_notified_at, lang);

                      return (
                        <article
                          key={listingAlert.id}
                          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold text-gray-900">
                                {listingAlert.label || t("profile.listingAlert")}
                              </h4>
                              {baseSummary && (
                                <p className="mt-1 text-sm text-gray-500">{baseSummary}</p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`w-fit rounded-lg px-3 py-1 text-xs font-bold ${listingAlert.is_active
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-gray-100 text-gray-500"
                              }`}>
                                {listingAlert.is_active ? t("profile.alertActive") : t("profile.alertInactive")}
                              </span>
                              <button
                                type="button"
                                onClick={() => setAlertDeleteTarget(listingAlert)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                title={t("profile.deleteAlert")}
                              >
                                <span className="sr-only">{t("profile.deleteAlert")}</span>
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v5" />
                                  <path d="M14 11v5" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${listingAlert.website_enabled
                              ? "bg-primary/10 text-primary"
                              : "bg-gray-100 text-gray-400"
                            }`}>
                              {t("profile.websiteNotifications")}
                            </span>
                            <span className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${listingAlert.telegram_enabled
                              ? "bg-primary/10 text-primary"
                              : "bg-gray-100 text-gray-400"
                            }`}>
                              {t("profile.telegramNotifications")}
                            </span>
                          </div>

                          <div className="mt-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                              {t("profile.alertFilters")}
                            </p>
                            {alertChips.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {alertChips.map((chip) => (
                                  <span
                                    key={chip}
                                    className="rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600"
                                  >
                                    {chip}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">{t("profile.noExtraAlertFilters")}</p>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-xs text-gray-400">
                            {createdAt && (
                              <span>{t("profile.createdAt")}: {createdAt}</span>
                            )}
                            <span>
                              {t("profile.lastNotified")}: {lastNotifiedAt || t("profile.neverNotified")}
                            </span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
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

      {alertDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {t("profile.deleteAlert")}
            </h3>
            <p className="text-sm text-gray-600">
              {t("profile.confirmDeleteAlert")}
            </p>
            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
              {alertDeleteTarget.label || t("profile.listingAlert")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                onClick={() => setAlertDeleteTarget(null)}
                disabled={isDeletingAlert}
              >
                {t("form.back")}
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center gap-2"
                onClick={handleDeleteListingAlert}
                disabled={isDeletingAlert}
              >
                {isDeletingAlert && (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                {t("profile.deleteAlert")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

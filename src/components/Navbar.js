"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import LoginButton from "@/components/LoginButton";
import AlertIcon from "@/components/icons/AlertIcon";
import CloseIcon from "@/components/icons/CloseIcon";
import MenuIcon from "@/components/icons/MenuIcon";
import Tooltip from "@/components/Tooltip";

export const GO_HOME_EVENT = "catdai-go-home";

export function emitGoHome() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GO_HOME_EVENT));
}

function NotificationButton({ disabled = false, open, unreadCount, onClick, t }) {
  return (
    <button
      type="button"
      aria-controls="notification-sidebar"
      aria-expanded={open}
      aria-label={t("notifications.open")}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
        open && !disabled
          ? "border-primary bg-primary-light text-primary-dark"
          : disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
            : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      <AlertIcon size={18} />
      {unreadCount > 0 && (
        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary">
          <span className="sr-only">{t("notifications.unreadCount", { count: unreadCount })}</span>
        </span>
      )}
    </button>
  );
}

function NotificationSidebar({ open, notifications, onClear, onClose, t }) {
  const unreadCount = notifications.filter((notification) => notification.unread).length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label={t("notifications.close")}
        className="absolute inset-0 h-full w-full cursor-default bg-gray-950/20"
        onClick={onClose}
      />
      <aside
        id="notification-sidebar"
        aria-label={t("notifications.title")}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl sm:w-[420px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-5">
          <div>
            <p className="text-lg font-semibold text-gray-950">{t("notifications.title")}</p>
            <p className="mt-1 text-sm text-gray-500">
              {unreadCount > 0
                ? t("notifications.unreadSummary", { count: unreadCount })
                : t("notifications.noUnread")}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("notifications.close")}
            onClick={onClose}
            className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`rounded-lg border p-4 ${
                    notification.unread
                      ? "border-primary/30 bg-primary-light"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${
                        notification.unread ? "bg-primary" : "bg-gray-300"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-sm font-semibold text-gray-950">{t(notification.titleKey)}</h2>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold leading-none ${
                            notification.unread
                              ? "bg-white text-primary-dark"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {notification.unread ? t("notifications.unread") : t("notifications.read")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-5 text-gray-600">{t(notification.bodyKey)}</p>
                      <time className="mt-3 block text-xs font-medium text-gray-400">{t(notification.timeKey)}</time>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 px-6 text-center">
              <p className="text-sm font-semibold text-gray-950">{t("notifications.emptyTitle")}</p>
              <p className="mt-2 text-sm leading-5 text-gray-500">{t("notifications.emptyBody")}</p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClear}
            disabled={notifications.length === 0}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
          >
            {t("notifications.clear")}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const mobileMenuRef = useRef(null);
  const [mobileMenuPath, setMobileMenuPath] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const mobileMenuOpen = mobileMenuPath === pathname;
  const notificationDisabled = loading || !isAuthenticated;
  const effectiveNotificationOpen = isAuthenticated && notificationOpen;
  const unreadNotificationCount = notifications.filter((notification) => notification.unread).length;
  const cadastruHref = `/${lang}/cadastru`;
  const isCadastruPath = pathname === "/cadastru" || /^\/(ro|ru)\/cadastru\/?$/.test(pathname);
  const isCalculatorPath = pathname === "/calculator";
  const isPricingPath = pathname === "/pricing";

  const handleLogoClick = (e) => {
    if (pathname === "/") {
      e.preventDefault();
      emitGoHome();
      router.replace("/");
    }
  };

  const handleLangChange = (nextLang) => {
    setLang(nextLang);
    setMobileMenuPath(null);

    if (/^\/(ro|ru)\/faq\/?$/.test(pathname)) {
      const target = `/${nextLang}/faq`;
      if (pathname !== target) router.replace(target);
    } else if (isCadastruPath) {
      const target = `/${nextLang}/cadastru`;
      if (pathname !== target) router.replace(target);
    }
  };

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const onPointerDown = (event) => {
      if (mobileMenuRef.current?.contains(event.target)) return;
      setMobileMenuPath(null);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") setMobileMenuPath(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!notificationOpen) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [notificationOpen]);

  const handleNotificationToggle = () => {
    if (notificationDisabled) return;

    setMobileMenuPath(null);
    if (!notificationOpen) {
      setNotifications((current) =>
        current.map((notification) => ({ ...notification, unread: false }))
      );
    }
    setNotificationOpen((prev) => !prev);
  };

  const handleNotificationClear = () => {
    setNotifications([]);
  };

  const handleNotificationClose = () => {
    setNotificationOpen(false);
  };

  return (
    <>
    <header className="relative sticky top-0 z-50 border-b border-gray-100 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
        <Link
          href="/"
          aria-label={t("nav.homeAriaLabel")}
          className="flex items-center gap-3 whitespace-nowrap"
          onClick={handleLogoClick}
          >
          <img
            src="/icon0.svg"
            alt=""
            className="h-11 w-auto object-contain"
          />
          <span className="text-lg font-semibold tracking-tight">Cât Dai?</span>
          <Tooltip text={t("nav.betaTooltip")}>
            <span className="inline-flex h-5 items-center rounded-full border border-gray-200 bg-gray-50 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              beta
            </span>
          </Tooltip>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/estimeaza"
            className={`inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium leading-none transition-colors ${
              pathname === "/estimeaza"
                ? "bg-gray-50 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {t("nav.estimate")}
          </Link>
          <Link
            href={cadastruHref}
            className={`inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium leading-none transition-colors ${
              isCadastruPath
                ? "bg-gray-50 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {t("nav.cadastru")}
          </Link>
          <Link
            href="/calculator"
            className={`inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium leading-none transition-colors ${
              isCalculatorPath
                ? "bg-gray-50 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {t("nav.calculator")}
          </Link>
          <Link
            href="/pricing"
            className={`inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-medium leading-none transition-colors ${
              isPricingPath
                ? "bg-gray-50 text-gray-900"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {t("nav.pricing")}
          </Link>
          <LoginButton className="inline-flex h-9 items-center rounded-lg px-2.5 leading-none text-gray-600 hover:bg-gray-50 hover:text-gray-900" />
          <NotificationButton
            disabled={notificationDisabled}
            open={effectiveNotificationOpen}
            unreadCount={unreadNotificationCount}
            onClick={handleNotificationToggle}
            t={t}
          />
          <div
            className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm font-medium"
            role="group"
            aria-label={t("nav.langAriaLabel")}
          >
            <button
              type="button"
              onClick={() => handleLangChange("ro")}
              className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                lang === "ro"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-gray-500 hover:text-foreground"
              }`}
              aria-pressed={lang === "ro"}
            >
              RO
            </button>
            <button
              type="button"
              onClick={() => handleLangChange("ru")}
              className={`cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                lang === "ru"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-gray-500 hover:text-foreground"
              }`}
              aria-pressed={lang === "ru"}
            >
              RU
            </button>
          </div>
        </div>

      <div ref={mobileMenuRef} className="flex items-center gap-2 md:hidden">
          <NotificationButton
            disabled={notificationDisabled}
            open={effectiveNotificationOpen}
            unreadCount={unreadNotificationCount}
            onClick={handleNotificationToggle}
            t={t}
          />
          <button
            type="button"
            aria-label={t("nav.menu")}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuPath((prev) => (prev === pathname ? null : pathname))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
          >
            <MenuIcon size={18} />
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-4 top-full z-50 mt-2 w-56 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
              <div className="space-y-2">
                <Link
                  href="/estimeaza"
                  onClick={() => setMobileMenuPath(null)}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium ${
                    pathname === "/estimeaza"
                      ? "bg-gray-50 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {t("nav.estimate")}
                </Link>
                <Link
                  href={cadastruHref}
                  onClick={() => setMobileMenuPath(null)}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium ${
                    isCadastruPath
                      ? "bg-gray-50 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {t("nav.cadastru")}
                </Link>
                <Link
                  href="/calculator"
                  onClick={() => setMobileMenuPath(null)}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium ${
                    isCalculatorPath
                      ? "bg-gray-50 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {t("nav.calculator")}
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileMenuPath(null)}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium ${
                    isPricingPath
                      ? "bg-gray-50 text-gray-900"
                      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {t("nav.pricing")}
                </Link>
                <LoginButton className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900" menuAlign="left" />
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-1">
                  <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                    {t("nav.langAriaLabel")}
                  </p>
                  <div
                    className="flex rounded-lg bg-white p-0.5 text-sm font-medium"
                    role="group"
                    aria-label={t("nav.langAriaLabel")}
                  >
                    <button
                      type="button"
                      onClick={() => handleLangChange("ro")}
                      className={`cursor-pointer flex-1 rounded-md px-3 py-1.5 transition-colors ${
                        lang === "ro"
                          ? "bg-gray-50 text-foreground shadow-sm"
                          : "text-gray-500 hover:text-foreground"
                      }`}
                      aria-pressed={lang === "ro"}
                    >
                      RO
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLangChange("ru")}
                      className={`cursor-pointer flex-1 rounded-md px-3 py-1.5 transition-colors ${
                        lang === "ru"
                          ? "bg-gray-50 text-foreground shadow-sm"
                          : "text-gray-500 hover:text-foreground"
                      }`}
                      aria-pressed={lang === "ru"}
                    >
                      RU
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
    {isAuthenticated && (
      <NotificationSidebar
        open={effectiveNotificationOpen}
        notifications={notifications}
        onClear={handleNotificationClear}
        onClose={handleNotificationClose}
        t={t}
      />
    )}
    </>
  );
}

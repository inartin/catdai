"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import LoginButton from "@/components/LoginButton";
import AlertIcon from "@/components/icons/AlertIcon";
import MenuIcon from "@/components/icons/MenuIcon";
import Tooltip from "@/components/Tooltip";

export const GO_HOME_EVENT = "catdai-go-home";

export function emitGoHome() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GO_HOME_EVENT));
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const mobileMenuRef = useRef(null);
  const [mobileMenuPath, setMobileMenuPath] = useState(null);
  const mobileMenuOpen = mobileMenuPath === pathname;
  const showAlertShortcut = !loading && isAuthenticated;
  const cadastruHref = `/${lang}/cadastru`;
  const isCadastruPath = pathname === "/cadastru" || /^\/(ro|ru)\/cadastru\/?$/.test(pathname);

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

  return (
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
          <LoginButton className="inline-flex h-9 items-center rounded-lg px-2.5 leading-none text-gray-600 hover:bg-gray-50 hover:text-gray-900" />
          {showAlertShortcut && (
            <Link
              href="/alerts"
              aria-label={t("nav.alerts")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
            >
              <AlertIcon size={18} />
            </Link>
          )}
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
          {showAlertShortcut && (
            <Link
              href="/alerts"
              aria-label={t("nav.alerts")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
            >
              <AlertIcon size={18} />
            </Link>
          )}
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
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/context/LanguageContext";

export const GO_HOME_EVENT = "catdai-go-home";

export function emitGoHome() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GO_HOME_EVENT));
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useTranslation();

  const handleLogoClick = (e) => {
    if (pathname === "/") {
      e.preventDefault();
      emitGoHome();
      router.replace("/");
    }
  };

  return (
    <header className="bg-white sticky top-0 z-50 border-b border-gray-100">
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
        </Link>

        <div className="flex items-center gap-4">
          <div
            className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm font-medium"
            role="group"
            aria-label={t("nav.langAriaLabel")}
          >
            <button
              type="button"
              onClick={() => setLang("ro")}
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
              onClick={() => setLang("ru")}
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
          {/* <Link
            href="#"
            className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors"
          >
            {t("nav.login")}
          </Link>
          <Link
            href="#"
            className="text-sm text-gray-500 hover:text-foreground transition-colors hidden sm:inline"
          >
            {t("nav.register")}
          </Link> */}
        </div>
      </div>
    </header>
  );
}

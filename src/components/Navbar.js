"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/context/LanguageContext";
import LoginButton from "@/components/LoginButton";

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

  const handleLangChange = (nextLang) => {
    setLang(nextLang);

    if (/^\/(ro|ru)\/faq\/?$/.test(pathname)) {
      const target = `/${nextLang}/faq`;
      if (pathname !== target) router.replace(target);
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
          <LoginButton />
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
      </div>
    </header>
  );
}

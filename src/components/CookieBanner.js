"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "@/context/LanguageContext";
import {
  ANALYTICS_CONSENT_EVENT, COOKIE_CONSENT_KEY, COOKIE_SETTINGS_EVENT, googleConsentByChoice, readCookieConsent, readGoogleConsent,
} from "@/lib/google-consent.mjs";

function subscribeToConsent(onChange) {
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onChange);
}

const initialChoice = () => "denied";

export default function CookieBanner() {
  const { t } = useTranslation();
  const choice = useSyncExternalStore(subscribeToConsent, readCookieConsent, initialChoice);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const openSettings = () => setShowSettings(true);
    window.addEventListener(COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  useEffect(() => {
    const syncConsent = (event) => {
      if (event.key !== COOKIE_CONSENT_KEY && event.key !== null) return;
      window.gtag?.("consent", "update", readGoogleConsent());
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
    };
    window.addEventListener("storage", syncConsent);
    return () => window.removeEventListener("storage", syncConsent);
  }, []);

  const saveChoice = (next) => {
    setShowSettings(false);
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, next);
    } catch {
      return;
    }
    window.gtag?.("consent", "update", googleConsentByChoice[next]);
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
  };

  if (!showSettings && choice !== null && choice !== "granted") return null;

  return (
    <section aria-label={t("cookies.settings")} className="fixed bottom-4 left-4 right-4 md:left-auto md:w-[28rem] bg-white p-4 rounded-lg shadow-lg border border-gray-200 z-50 text-sm">
      <p className="text-gray-700 mb-3">
        {t("cookies.description")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => saveChoice("denied")}
          className="cursor-pointer px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          {t("cookies.decline")}
        </button>
        <button
          type="button"
          onClick={() => saveChoice("analytics_only")}
          className="cursor-pointer px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          {t("cookies.analyticsOnly")}
        </button>
        <button
          type="button"
          onClick={() => saveChoice("analytics_and_ads")}
          className="cursor-pointer px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-100 rounded transition-colors"
        >
          {t("cookies.analyticsAndAds")}
        </button>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/context/LanguageContext";
import { ArrowRight } from "@/components/icons/ArrowsIcons";

const ERROR_KEYS = {
  invalid_url: "linkAnalyzer.errorInvalidUrl",
  unsupported_listing_type: "linkAnalyzer.errorUnsupportedType",
  not_chisinau: "linkAnalyzer.errorNotChisinau",
  insufficient_data: "linkAnalyzer.errorInsufficient",
  not_a_listing: "linkAnalyzer.errorInsufficient",
  fetch_failed: "linkAnalyzer.errorFetch",
  upstream_blocked: "linkAnalyzer.errorUpstreamBlocked",
  rate_limited: "linkAnalyzer.errorRateLimit",
};

function buildListingAnalysisUrl(payload) {
  const search = new URLSearchParams();
  Object.entries(payload.params || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  });
  if (Number.isFinite(Number(payload.listing_price))) {
    search.set("listing_price", String(payload.listing_price));
  }
  if (payload.listing_currency) search.set("listing_currency", payload.listing_currency);
  if (payload.external_id) search.set("listing_id", String(payload.external_id));
  search.set("_new", "1");
  return `/anunt?${search.toString()}`;
}

export default function LinkAnalyzer({ titleTag: TitleTag = "p" }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyze = async () => {
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        setError(t(ERROR_KEYS[data.error] || "linkAnalyzer.errorGeneric"));
        return;
      }

      router.push(buildListingAnalysisUrl(data));
    } catch {
      setError(t("linkAnalyzer.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      analyze();
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </span>
        <div className="text-left">
          <TitleTag className="text-sm font-bold text-gray-900">{t("linkAnalyzer.title")}</TitleTag>
          <p className="text-xs text-gray-500">{t("linkAnalyzer.subtitle")}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("linkAnalyzer.placeholder")}
          disabled={loading}
          aria-label={t("linkAnalyzer.title")}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={analyze}
          disabled={loading || !url.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {t("linkAnalyzer.analyzing")}
            </>
          ) : (
            <>
              {t("linkAnalyzer.button")}
              <ArrowRight size={16} className="translate-y-[-1px]" />
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

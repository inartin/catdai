"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight } from "@/components/icons/ArrowsIcons";
import {
  DuplicateCheckIcon,
  PriceAnalysisIcon,
  PriceHistoryIcon,
  SimilarListingsIcon,
} from "@/components/icons/AnalyzerFeatureIcons";

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

// Tear-off strips, like the fringe of a street ad glued on a pillar: each one
// hangs at its own angle, with its own torn bottom edge and slightly different length.
const FEATURE_ITEMS = [
  {
    key: "linkAnalyzer.featurePriceAnalysis",
    Icon: PriceAnalysisIcon,
    tilt: -2.4,
    heightClassName: "h-[6.5rem] sm:h-28",
    tornEdge:
      "polygon(0 0, 100% 0, 100% calc(100% - 7px), 87% calc(100% - 2px), 72% calc(100% - 8px), 58% calc(100% - 3px), 44% calc(100% - 9px), 30% calc(100% - 2px), 16% calc(100% - 7px), 6% calc(100% - 3px), 0 calc(100% - 8px))",
  },
  {
    key: "linkAnalyzer.featureSimilarListings",
    Icon: SimilarListingsIcon,
    tilt: 1.7,
    heightClassName: "h-[7.25rem] sm:h-[7.5rem]",
    tornEdge:
      "polygon(0 0, 100% 0, 100% calc(100% - 4px), 85% calc(100% - 9px), 70% calc(100% - 2px), 55% calc(100% - 8px), 42% calc(100% - 3px), 27% calc(100% - 9px), 13% calc(100% - 4px), 0 calc(100% - 7px))",
  },
  {
    key: "linkAnalyzer.featureDuplicates",
    Icon: DuplicateCheckIcon,
    tilt: -1.1,
    heightClassName: "h-[6.25rem] sm:h-[6.75rem]",
    tornEdge:
      "polygon(0 0, 100% 0, 100% calc(100% - 8px), 90% calc(100% - 3px), 75% calc(100% - 9px), 62% calc(100% - 2px), 47% calc(100% - 7px), 32% calc(100% - 3px), 18% calc(100% - 9px), 7% calc(100% - 2px), 0 calc(100% - 6px))",
  },
  {
    key: "linkAnalyzer.featurePriceHistory",
    Icon: PriceHistoryIcon,
    tilt: 2.6,
    heightClassName: "h-[6.75rem] sm:h-28",
    tornEdge:
      "polygon(0 0, 100% 0, 100% calc(100% - 6px), 86% calc(100% - 1px), 73% calc(100% - 8px), 59% calc(100% - 3px), 45% calc(100% - 9px), 31% calc(100% - 2px), 17% calc(100% - 8px), 6% calc(100% - 4px), 0 calc(100% - 7px))",
  },
];

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
  if (payload.listing_address) search.set("listing_address", payload.listing_address);
  if (payload.external_id) search.set("listing_id", String(payload.external_id));
  search.set("_new", "1");
  return `/anunt?${search.toString()}`;
}

export default function LinkAnalyzer({
  titleTag: TitleTag = "p",
  className = "mt-5",
  showFeaturePapers = false,
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
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
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
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

  const cardClassName = showFeaturePapers
    ? "relative z-10 rotate-[-0.4deg] rounded-sm border border-gray-200 bg-[#fdfcf6] p-5"
    : "relative z-10 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm";

  return (
    <div className={`${className} relative isolate`}>
      <div className={cardClassName}>
        {showFeaturePapers && (
          <>
            <span
              aria-hidden="true"
              className="absolute -top-2.5 left-5 z-20 h-5 w-16 -rotate-6 rounded-[2px] bg-[#fbf6dd]/80 shadow-sm ring-1 ring-black/5"
            />
            <span
              aria-hidden="true"
              className="absolute -top-2.5 right-5 z-20 h-5 w-16 rotate-3 rounded-[2px] bg-[#fbf6dd]/80 shadow-sm ring-1 ring-black/5"
            />
          </>
        )}
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

      {showFeaturePapers && (
        <div className="relative z-0 -mt-2 grid grid-cols-4 gap-1.5 px-4 sm:gap-2.5 sm:px-8">
          {FEATURE_ITEMS.map(({ key, Icon, tilt, heightClassName, tornEdge }) => (
            <div
              key={key}
              className={`relative origin-top ${heightClassName}`}
              style={{ transform: `rotate(${tilt}deg)` }}
            >
              <div
                className="flex h-full flex-col items-center justify-start border-x border-gray-200/80 bg-[#fdfcf6] px-1.5 pt-6 sm:pt-7 shadow-[0_10px_18px_rgba(15,23,42,0.18)] sm:px-2"
                style={{
                  clipPath: tornEdge,
                  backgroundImage:
                    "repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(120,113,80,0.07) 22px, rgba(120,113,80,0.07) 23px)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black/15 to-transparent"
                />
                <Icon size={24} className="mb-2 shrink-0 text-gray-600" />
                <span className="text-center text-[11px] font-extrabold leading-snug text-gray-800 sm:text-xs">
                  {t(key)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

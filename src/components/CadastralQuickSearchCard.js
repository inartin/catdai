"use client";

import { useState } from "react";
import { useTranslation } from "@/context/LanguageContext";

function SearchIcon({ className = "w-4 h-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function StatusIcon({ tone }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
        <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
      <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
    </svg>
  );
}

export default function CadastralQuickSearchCard({
  value,
  onChange,
  onSearch,
  loading = false,
  disabled = false,
  error = "",
  successText = "",
  partialText = "",
  className = "",
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const canSearch = !loading && !disabled && String(value || "").trim();

  return (
    <section className={`mx-auto w-full max-w-xl rounded-xl border border-blue-200 bg-blue-50/40 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full cursor-pointer items-start gap-3 p-4 text-left sm:p-5"
        aria-expanded={isOpen}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-blue-500 ring-1 ring-blue-100">
          <SearchIcon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{t("form.cadastralQuickTitle")}</span>
            <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs font-semibold text-blue-600">
              {t("form.optionalBadge")}
            </span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-gray-500">
            {t("form.cadastralQuickSubtitle")}
          </span>
        </span>
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-blue-100">
          <ChevronIcon open={isOpen} />
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <div className="border-t border-blue-100 pt-4">
            <label className="text-sm text-gray-600 mb-1.5 block">
              {t("form.cadastralQuickLabel")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t("form.cadastralPlaceholder")}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearch();
                }}
                disabled={loading || disabled}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={onSearch}
                disabled={!canSearch}
                className="flex shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 text-sm font-medium text-white transition-all duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t("form.cadastralSearching")}
                  </>
                ) : (
                  <>
                    <SearchIcon />
                    {t("form.cadastralSearch")}
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                <StatusIcon />
                {error}
              </p>
            )}

            {successText && (
              <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 animate-fade-in">
                <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 mb-2">
                  <StatusIcon tone="success" />
                  {t("form.cadastralFound")}
                </p>
                <p className="text-xs text-emerald-600">{successText}</p>
              </div>
            )}

            {partialText && (
              <div className="mt-3 rounded-xl bg-sky-50 border border-sky-200 p-3 animate-fade-in">
                <p className="text-xs font-medium text-sky-700 flex items-center gap-1.5 mb-1.5">
                  <StatusIcon />
                  {t("form.cadastralPartial")}
                </p>
                <p className="text-xs text-sky-600">{partialText}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

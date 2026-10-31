"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function ValuationEvidenceSummary({ evidence, comparableCount, className = "mb-5 mt-4" }) {
  const { t, lang } = useTranslation();
  const count = evidence?.comparable_count ?? comparableCount;
  if (!Number.isInteger(count) || count <= 0) return null;

  const locale = lang === "ru" ? "ru-RU" : lang === "en" ? "en-GB" : "ro-MD";
  const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return date.toLocaleDateString(locale, {
      day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Chisinau",
    });
  };
  const from = formatDate(evidence?.observed_from);
  const to = formatDate(evidence?.observed_to);
  const observedPeriod = from && to ? (from === to ? to : `${from} - ${to}`) : null;

  return (
    <div className={`rounded-xl border border-primary/10 bg-primary/5 p-4 ${className}`}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-gray-600">{t("result.evidenceComparables")}</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{count.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-600">{t("result.evidenceObserved")}</dt>
          <dd className="mt-1 text-sm font-semibold text-gray-900">
            {observedPeriod || t("result.evidenceDatesUnavailable")}
          </dd>
        </div>
      </dl>
      {observedPeriod && (
        <p className="mt-3 text-xs leading-5 text-gray-500">
          {t("result.evidenceObservationNote")}
          {Number.isInteger(evidence.observed_count) && evidence.observed_count < count && ` ${t("result.evidenceObservationCoverage", {
            count: evidence.observed_count, total: count,
          })}`}
        </p>
      )}
    </div>
  );
}

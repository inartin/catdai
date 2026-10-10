"use client";

import { useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { municipalReportDate, municipalSourceUrl } from "@/lib/cadastru-municipal-reports";

const STATUS_STYLES = {
  NEW: "bg-blue-50 text-blue-700",
  INTHEWORK: "bg-orange-50 text-orange-700",
  POSTPONED: "bg-amber-50 text-amber-700",
  SOLVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-gray-100 text-gray-600",
};
const DISPLAY_LIMIT = 3;

function Report({ report, nearby, lang, t, formatNumber }) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const category = report.category?.[lang] || report.category?.ro || report.category?.ru;
  const title = category || report.title || t("cadastru.reportsUnnamed");
  const sourceUrl = municipalSourceUrl(report.source_url);
  const status = t(`cadastru.reportsStatus.${report.status}`);

  return (
    <article className="min-w-0 border-b border-gray-100 py-5 first:pt-0 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-1 font-medium ${STATUS_STYLES[report.status] || STATUS_STYLES.REJECTED}`}>
          {status.startsWith("cadastru.") ? report.status_label || report.status : status}
        </span>
        <time dateTime={report.reported_at.slice(0, 10)} className="text-gray-500">{municipalReportDate(report.reported_at, lang)}</time>
      </div>
      <h4 className="mt-3 break-words text-base font-semibold text-gray-950 sm:text-lg">{title}</h4>
      {nearby ? (
        <p className="mt-1 break-words text-sm text-gray-500">
          {report.address ? `${report.address} · ` : ""}
          {t("cadastru.reportsDistance", { distance: formatNumber.format(report.distance_m) })}
        </p>
      ) : null}
      {report.is_public && report.description ? (
        <>
          <p className={`mt-2 text-sm leading-relaxed text-gray-600 sm:text-base ${descriptionExpanded ? "whitespace-pre-line break-words" : "truncate"}`}>
            {report.description}
          </p>
          <button
            type="button"
            aria-expanded={descriptionExpanded}
            onClick={() => setDescriptionExpanded((expanded) => !expanded)}
            className="mt-1 cursor-pointer text-sm font-medium text-primary hover:underline"
          >
            {t(descriptionExpanded ? "cadastru.reportsReadLess" : "cadastru.reportsReadMore")}
          </button>
        </>
      ) : null}
      {!report.is_public ? <p className="mt-2 text-sm text-gray-500">{t("cadastru.reportsPrivate")}</p> : null}
      {report.is_public && report.photo_count > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" />
          </svg>
          {t(report.photo_count === 1 ? "cadastru.reportsPhoto" : "cadastru.reportsPhotos", { count: report.photo_count })}
        </p>
      ) : null}
      {report.is_public && sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          {t("cadastru.reportsOriginal")} <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </article>
  );
}

function ReportGroupContent({ group, label, nearby, lang, t, formatNumber }) {
  const [visibleCount, setVisibleCount] = useState(DISPLAY_LIMIT);
  const displayed = group.reports.slice(0, visibleCount);
  const canLoadMore = displayed.length < group.reports.length;

  return (
    <>
      {displayed.length ? displayed.map((report) => (
        <Report key={report.id} report={report} nearby={nearby} lang={lang} t={t} formatNumber={formatNumber} />
      )) : <p className="text-sm text-gray-500">{t("cadastru.reportsGroupEmpty")}</p>}
      {group.has_more || group.count > DISPLAY_LIMIT ? (
        <p className="mt-4 text-xs text-gray-500">{t("cadastru.reportsShown", { group: label, shown: displayed.length, count: formatNumber.format(group.count) })}</p>
      ) : null}
      {canLoadMore ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => Math.min(count + DISPLAY_LIMIT, group.reports.length))}
          className="mt-4 cursor-pointer rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 hover:border-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          {t("cadastru.reportsLoadMore")}
        </button>
      ) : null}
      {!canLoadMore && (group.has_more || group.count > group.reports.length) ? (
        <p className="mt-2 text-xs text-gray-500">{t("cadastru.reportsMoreAtSource")}</p>
      ) : null}
    </>
  );
}

export default function CadastruMunicipalReportsCard({ reports, loading, unavailable }) {
  const { lang, t } = useTranslation();
  const formatNumber = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "ro-MD", { maximumFractionDigits: 0 });
  const checkedDate = reports ? new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "ro-MD", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Chisinau",
  }).format(new Date(reports.cache.fetched_at)) : "";
  const groups = reports ? [
    ...(reports.address_match_available ? [{ key: "at_address", label: t("cadastru.reportsAtAddress") }] : []),
    { key: "nearby", label: t("cadastru.reportsNearby", { distance: formatNumber.format(reports.search_radius_m) }) },
  ] : [];

  return (
    <section className="mx-1 mt-6 rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-md sm:p-7" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="flex min-w-0 items-start gap-2.5 text-xl font-bold text-gray-950 sm:text-2xl">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-1 h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true">
            <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          {t("cadastru.reportsTitle")}
        </h2>
        {reports ? <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">{t("cadastru.reportsPeriod", { years: reports.period.years })}</span> : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">{t("cadastru.reportsSubtitle")}</p>
      {loading ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.reportsLoading")}</p> : null}
      {unavailable ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.reportsUnavailable")}</p> : null}
      {!loading && !unavailable && reports ? (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-3 border-b border-gray-100 pb-6 text-center">
            {[
              [reports.summary.at_address, "cadastru.reportsCountAddress"],
              [reports.summary.nearby, "cadastru.reportsCountNearby"],
              [reports.summary.solved, "cadastru.reportsCountSolved"],
            ].map(([value, label]) => (
              <div key={label}>
                <dd className="text-2xl font-bold text-gray-950 sm:text-3xl">{value === null ? "—" : formatNumber.format(value)}</dd>
                <dt className="mt-1 text-xs text-gray-500 sm:text-sm">{t(label)}</dt>
              </div>
            ))}
          </dl>
          {!reports.address_match_available ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.reportsAddressUnknown")}</p> : null}
          {reports.summary.total === 0 ? <p className="mt-5 text-sm text-gray-500">{t("cadastru.reportsEmpty")}</p> : (
            <div>
              {groups.map(({ key, label }) => {
                const group = reports[key];
                const content = (
                  <ReportGroupContent group={group} label={label} nearby={key === "nearby"} lang={lang} t={t} formatNumber={formatNumber} />
                );
                return key === "nearby" ? (
                  <details key={key} className="group overflow-hidden rounded-xl border border-emerald-200 bg-white">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-white p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:p-5 [&::-webkit-details-marker]:hidden">
                      <h3 className="text-base font-semibold text-gray-950 sm:text-lg">{label}</h3>
                      <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
                        <span className="group-open:hidden">{t("cadastru.reportsExpandNearby")}</span>
                        <span className="hidden group-open:inline">{t("cadastru.reportsCollapseNearby")}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </summary>
                    <div className="border-t border-emerald-100 bg-white p-4 sm:p-5">{content}</div>
                  </details>
                ) : (
                  <div key={key} className="py-6">
                    <h3 className="mb-4 text-lg font-semibold text-gray-950">{label}</h3>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-5 space-y-1 text-xs leading-relaxed text-gray-500">
            {reports.incomplete ? <p>{t("cadastru.reportsIncomplete")}</p> : null}
            {reports.cache.stale ? <p>{t("cadastru.reportsStale")}</p> : null}
            <p>{t("cadastru.reportsNote")}</p>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-sm">
            <div className="text-gray-500">
              <p>{t("cadastru.reportsSource")}</p>
              <p className="mt-1 text-xs">{t("cadastru.reportsChecked", { date: checkedDate })}</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

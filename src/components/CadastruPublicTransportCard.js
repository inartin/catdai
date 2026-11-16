"use client";
import CadastruFreshnessNote from "@/components/CadastruFreshnessNote";

import Image from "next/image";
import { useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";

function VillageTimetable({ timetable, onLockedClick }) {
  const { t, lang } = useTranslation();
  const weekday = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
  const sourceDate = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" });
  const fare = new Intl.NumberFormat(lang, { style: "currency", currency: "MDL", currencyDisplay: "code" });
  const km = new Intl.NumberFormat(lang, { style: "unit", unit: "kilometer" });

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <h3 className="font-semibold text-gray-900">{t("cadastru.transportVillageRoutes", { locality: timetable.locality })}</h3>
      <ul className="mt-3 space-y-3">
        {timetable.routes.map((route, index) => {
          const firstDays = route.departures?.[0]?.days;
          const dailyCount = firstDays?.length && route.departures.every(({ days }) => days.join() === firstDays.join())
            ? route.departures.length : null;
          return <li key={index} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
            {route.locked ? (
              <button type="button" onClick={onLockedClick} disabled={!onLockedClick} aria-label={t("cadastru.payToUnlock")}
                className="cursor-pointer rounded text-left text-sm font-medium text-emerald-950 focus-visible:outline-2 disabled:cursor-default">
                <span aria-hidden="true" className="select-none blur-sm">{t("cadastru.transportLockedRoute")}</span>
              </button>
            ) : (
              <>
                {route.to_chisinau ? <p className="text-sm font-semibold text-emerald-800">{t("cadastru.transportDirectCapital")}</p> : null}
                <p className="break-words font-semibold text-gray-900">{route.ref ? route.ref + " · " : ""}{route.from} → {route.to}</p>
                {route.via.length ? <p className="mt-1 text-sm text-gray-600">{t("cadastru.transportVia", { places: route.via.join(", ") })}</p> : null}
                {Number.isFinite(route.distance_km) ? <p className="mt-1 text-sm text-gray-600">{km.format(route.distance_km)}</p> : null}
                {route.departures.length ? (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-600">{route.service_date
                      ? t("cadastru.transportDatedDepartures", { count: route.departures.length, date: sourceDate.format(new Date(route.service_date + "T00:00:00Z")) })
                      : dailyCount ? t("cadastru.transportDeparturesPerServiceDay", { count: dailyCount })
                        : t("cadastru.transportVillageDepartures", { locality: timetable.locality })}</p>
                    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {route.departures.map(({ time, days, distance_km, fare_mdl }, tripIndex) => (
                        <li key={tripIndex} className="text-sm text-gray-700">
                          <span className="font-semibold tabular-nums text-gray-900">{time}</span>
                          {days.length === 7 ? " · " + t("cadastru.transportDaily") : days.length
                            ? " · " + days.map((day) => weekday.format(new Date(Date.UTC(2024, 0, day)))).join(", ") : ""}
                          {Number.isFinite(distance_km) ? " · " + km.format(distance_km) : ""}
                          {Number.isFinite(fare_mdl) ? " · " + fare.format(fare_mdl) : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-gray-600">
                  <a href={route.source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{route.source.name}</a>
                  {" · "}{sourceDate.format(new Date(route.source.date + "T00:00:00Z"))}
                </p>
              </>
            )}
          </li>;
        })}
      </ul>
    </div>
  );
}

export default function CadastruPublicTransportCard({ transport, loading, unavailable, onLockedClick }) {
  const { t } = useTranslation();
  const [expandedModes, setExpandedModes] = useState({});
  const timetable = transport?.village_timetable;
  const hasTimetable = Boolean(timetable?.routes?.length);
  const groups = (Array.isArray(transport?.route_groups) ? transport.route_groups : [])
    .filter((group) => Array.isArray(group?.routes) && group.routes.length);

  return (
    <section className="mx-1 mt-6 rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-md sm:p-7" aria-busy={loading}>
      <h2 className="text-xl font-bold text-gray-950 sm:text-2xl">{t("cadastru.transportTitle")}</h2>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <span aria-hidden="true" className="shrink-0">
            <CadastruLoadingIcon bold className="h-8 w-auto text-primary-dark" />
          </span>
          <span>{t("cadastru.transportLoading")}</span>
        </p>
      ) : null}
      {unavailable ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.transportUnavailable")}</p> : null}
      {!loading && !unavailable && transport && !groups.length && !hasTimetable
        ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.transportEmpty")}</p>
        : null}
      {transport?.scope === "locality" && groups.length ? (
        <div className="mt-5">
          <h3 className="font-semibold text-gray-900">{t("cadastru.transportLocalityRoutes")}</h3>
          <p className="mt-1 text-sm text-gray-500">{t("cadastru.transportLocalityNote")}</p>
        </div>
      ) : null}
      {groups.length ? (
        <div className="mt-5 space-y-5">
          {groups.map((group) => {
            const modeLabel = t(`cadastru.transportMode.${group.mode}`);
            const canExpand = (group.mode === "bus" || group.mode === "trolleybus") && group.routes.length > 2;
            const expanded = Boolean(expandedModes[group.mode]);
            const visibleRoutes = canExpand && !expanded ? group.routes.slice(0, 3) : group.routes;
            return (
              <div key={group.mode} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                  {group.mode === "bus" || group.mode === "trolleybus" ? (
                    <Image src={`/icons/transport/${group.mode}.svg`} width={24} height={24} alt="" aria-hidden="true" className="shrink-0" />
                  ) : null}
                  {modeLabel.startsWith("cadastru.") ? t("cadastru.transportMode.unknown") : modeLabel}
                </h3>
                <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {visibleRoutes.map((route, index) => {
                    const Route = route.locked && onLockedClick ? "button" : "div";
                    return (
                      <li key={route.locked ? `${group.mode}-locked-${index}` : `${group.mode}-${route.ref}`} className={`min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 ${canExpand && !expanded && index === 2 ? "hidden lg:list-item" : ""}`}>
                        <Route
                          type={Route === "button" ? "button" : undefined}
                          onClick={route.locked ? onLockedClick : undefined}
                          aria-label={route.locked ? t("cadastru.payToUnlock") : undefined}
                          className={`block w-full text-left ${Route === "button" ? "cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" : ""}`}
                        >
                          <span aria-hidden={route.locked || undefined} className={`block ${route.locked ? "select-none blur-sm" : ""}`}>
                            <span
                              className="inline-flex h-12 min-w-12 items-center justify-center rounded-lg bg-emerald-950 px-2 text-[1.75rem] leading-none font-semibold text-white tabular-nums"
                              style={{ fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace' }}
                            >
                              {route.ref}
                            </span>
                            {route.name && route.name !== route.ref
                              ? <span className="mt-2 block text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{route.locked ? t("cadastru.transportLockedRoute") : route.name}</span> : null}
                          </span>
                        </Route>
                      </li>
                    );
                  })}
                </ul>
                {canExpand ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpandedModes((modes) => ({ ...modes, [group.mode]: !modes[group.mode] }))}
                    className={`mt-3 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${group.routes.length === 3 ? "lg:hidden" : ""}`}
                  >
                    {t(expanded ? "cadastru.transportShowLess" : "cadastru.transportShowAll")}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {hasTimetable ? <VillageTimetable timetable={timetable} onLockedClick={onLockedClick} /> : null}
      {transport ? (
        <div className="mt-5 space-y-1 text-xs text-gray-500">
          <CadastruFreshnessNote freshness={{ property: transport.cache }} />
          {transport.incomplete ? <p>{t("cadastru.transportIncomplete")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

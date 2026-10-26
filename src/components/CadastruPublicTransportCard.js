"use client";
import CadastruFreshnessNote from "@/components/CadastruFreshnessNote";

import Image from "next/image";
import { useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";

export default function CadastruPublicTransportCard({ transport, loading, unavailable }) {
  const { t } = useTranslation();
  const [expandedModes, setExpandedModes] = useState({});
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
      {!loading && !unavailable && transport && !groups.length
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
                  {visibleRoutes.map((route, index) => (
                    <li key={`${group.mode}-${route.ref}`} className={`min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 ${canExpand && !expanded && index === 2 ? "hidden lg:list-item" : ""}`}>
                      <span
                        className="inline-flex h-12 min-w-12 items-center justify-center rounded-lg bg-emerald-950 px-2 text-[1.75rem] leading-none font-semibold text-white tabular-nums"
                        style={{ fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace' }}
                      >
                        {route.ref}
                      </span>
                      {route.name && route.name !== route.ref
                        ? <p className="mt-2 text-sm leading-relaxed text-gray-700 [overflow-wrap:anywhere]">{route.name}</p> : null}
                    </li>
                  ))}
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
      {transport ? (
        <div className="mt-5 space-y-1 text-xs text-gray-500">
          <CadastruFreshnessNote freshness={{ property: transport.cache }} />
          {transport.incomplete ? <p>{t("cadastru.transportIncomplete")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

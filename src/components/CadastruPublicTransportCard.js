"use client";

import Image from "next/image";
import { useTranslation } from "@/context/LanguageContext";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";

export default function CadastruPublicTransportCard({ transport, loading, unavailable }) {
  const { t } = useTranslation();
  const groups = (Array.isArray(transport?.route_groups) ? transport.route_groups : [])
    .filter((group) => Array.isArray(group?.routes) && group.routes.length);

  return (
    <section className="mx-1 mt-6 rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-md sm:p-7" aria-busy={loading}>
      <h2 className="text-xl font-bold text-gray-950 sm:text-2xl">{t("cadastru.transportTitle")}</h2>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <span aria-hidden="true" className="shrink-0">
            <CadastruLoadingIcon className="h-6 w-auto text-primary" />
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
            return (
              <div key={group.mode} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                  {group.mode === "bus" || group.mode === "trolleybus" ? (
                    <Image src={`/icons/transport/${group.mode}.svg`} width={24} height={24} alt="" aria-hidden="true" className="shrink-0" />
                  ) : null}
                  {modeLabel.startsWith("cadastru.") ? t("cadastru.transportMode.unknown") : modeLabel}
                </h3>
                <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {group.routes.map((route) => (
                    <li key={`${group.mode}-${route.ref}`} className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
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
              </div>
            );
          })}
        </div>
      ) : null}
      {transport ? (
        <div className="mt-5 space-y-1 text-xs text-gray-500">
          {transport.cache?.stale ? <p>{t("cadastru.transportStale")}</p> : null}
          {transport.incomplete ? <p>{t("cadastru.transportIncomplete")}</p> : null}
          <p>{transport.attribution || "© OpenStreetMap contributors"}</p>
        </div>
      ) : null}
    </section>
  );
}

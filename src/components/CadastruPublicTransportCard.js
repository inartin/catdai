"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function CadastruPublicTransportCard({ transport, loading, unavailable }) {
  const { t } = useTranslation();
  const groups = (Array.isArray(transport?.route_groups) ? transport.route_groups : [])
    .filter((group) => Array.isArray(group?.routes) && group.routes.length);

  return (
    <section className="mx-1 mt-6 rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-md sm:p-7" aria-busy={loading}>
      <h2 className="text-xl font-bold text-gray-950 sm:text-2xl">{t("cadastru.transportTitle")}</h2>
      {loading ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.transportLoading")}</p> : null}
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
                <h3 className="font-semibold text-gray-900">
                  {modeLabel.startsWith("cadastru.") ? t("cadastru.transportMode.unknown") : modeLabel}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.routes.map((route) => (
                    <span key={`${group.mode}-${route.ref}`} className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm text-emerald-900">
                      <span className="font-semibold">{route.ref}</span>
                      {route.name && route.name !== route.ref
                        ? <span className="ml-1 text-emerald-800">· {route.name}</span> : null}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {transport ? (
        <div className="mt-5 space-y-1 text-xs text-gray-500">
          {transport.incomplete ? <p>{t("cadastru.transportIncomplete")}</p> : null}
          <p>{transport.attribution || "© OpenStreetMap contributors"}</p>
        </div>
      ) : null}
    </section>
  );
}

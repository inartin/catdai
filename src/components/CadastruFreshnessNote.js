"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function CadastruFreshnessNote({ freshness }) {
  const { lang, t } = useTranslation();
  const property = freshness?.property;
  const building = freshness?.building;
  const formatDate = value => Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "ro-RO").format(new Date(value)) : "";
  const propertyDate = formatDate(property?.fetched_at);
  const buildingDate = formatDate(building?.fetched_at);
  const stale = Object.values(freshness || {}).some(section => section?.stale);
  if (!propertyDate && !buildingDate && !stale) return null;
  return (
    <div className="mt-3 space-y-1 text-xs text-gray-500">
      {propertyDate ? <p>{t("cadastru.checkedAt")} {propertyDate}</p> : null}
      {buildingDate && buildingDate !== propertyDate ? <p>{t("cadastru.buildingCheckedAt")} {buildingDate}</p> : null}
      {stale ? <p>{t("cadastru.savedDataStale")}</p> : null}
    </div>
  );
}

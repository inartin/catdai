"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function CadastruFreshnessNote({ freshness }) {
  const { t } = useTranslation();
  const stale = Object.values(freshness || {}).some(section => section?.stale);
  if (!stale) return null;
  return (
    <div className="mt-3 space-y-1 text-xs text-gray-500">
      <p>{t("cadastru.savedDataStale")}</p>
    </div>
  );
}

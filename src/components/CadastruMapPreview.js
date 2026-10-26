"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import LockIcon from "@/components/icons/LockIcon";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";

export default function CadastruMapPreview({ address, cadastralNumber, onUnlock }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState({ key: "", url: "", failed: false });
  const key = JSON.stringify([address || "", cadastralNumber || ""]);
  const current = preview.key === key ? preview : { url: "", failed: false };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let objectUrl;
    const timeout = setTimeout(() => controller.abort(), 20_000);
    fetch("/api/cadastru/map-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(address ? { address } : {}), ...(cadastralNumber ? { cadastral_number: cadastralNumber } : {}) }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok || response.headers.get("content-type") !== "image/webp") throw new Error("Preview unavailable");
      const blob = await response.blob();
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ key, url: objectUrl, failed: false });
    }).catch(() => {
      if (active) setPreview({ key, url: "", failed: true });
    }).finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [address, cadastralNumber, key]);

  return (
    <div className="mt-6 w-full overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-md">
      <h3 className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3 text-base font-bold text-gray-950 sm:px-6 sm:text-lg">
        {t("cadastru.mapCardTitle")}
      </h3>
      <div className="relative flex h-[360px] w-full items-center justify-center overflow-hidden bg-stone-200 sm:h-[440px]" aria-busy={!current.url && !current.failed}>
        {current.url ? <img src={current.url} alt={t("cadastru.mapPreviewAlt")} className="absolute inset-0 h-full w-full object-cover" /> : null}
        {!current.url && !current.failed ? (
          <div role="status" className="flex items-center gap-2 text-sm text-emerald-900">
            <CadastruLoadingIcon bold className="h-8 w-auto" />
            {t("cadastru.mapLoading")}
          </div>
        ) : onUnlock || current.failed ? (
          <div className={`${current.failed ? "relative mx-5" : "absolute inset-x-4 bottom-4 mx-auto"} max-w-sm rounded-2xl border border-white/60 bg-white/95 p-4 text-center shadow-sm`}>
            <p className="text-sm leading-relaxed text-gray-700">{t(current.failed ? "cadastru.mapPreviewUnavailable" : "cadastru.mapPreviewLocked")}</p>
            {onUnlock ? <button type="button" onClick={onUnlock}
              className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
              <LockIcon size={16} strokeWidth={2.2} />
              {t("cadastru.payToUnlock")}
            </button> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

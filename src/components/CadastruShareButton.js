"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { recordCadastruShareClick } from "@/lib/cadastru-share-tracking";
import { getCadastruSharePath } from "@/lib/cadastru-share-url";

export default function CadastruShareButton({ cadastralNumber, address, shareSlug, searchToken }) {
  const { session } = useAuth();
  const { lang, t } = useTranslation();
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function shareReport() {
    if (sharing) return;
    setSharing(true);
    setError(false);
    setCopied(false);
    setManualUrl("");
    try {
      let url;
      let slug = shareSlug;
      if (shareSlug) {
        url = `${window.location.origin}${await getCadastruSharePath(shareSlug, lang)}`;
      } else {
        const response = await fetch("/api/cadastru/share", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ cadastral_number: cadastralNumber, address, lang, search_token: searchToken }),
        });
        if (!response.ok) throw new Error("Share request failed");
        ({ url, slug } = await response.json());
        if (!url) throw new Error("Missing share URL");
      }
      if (slug) void recordCadastruShareClick(slug);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // Keep the generated public link available when clipboard access is denied.
        setManualUrl(url);
      }
    } catch {
      setError(true);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button type="button" onClick={shareReport} disabled={sharing}
        className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-primary shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {copied ? <path d="m5 12 4 4L19 6" /> : <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="m8 6 4-4 4 4M12 2v13" /></>}
        </svg>
        <span aria-live="polite">{t(sharing ? "result.sharing" : copied ? "result.linkCopied" : "cadastru.shareReport")}</span>
      </button>
      {error && <p role="alert" className="max-w-64 text-xs text-red-700">{t("cadastru.shareError")}</p>}
      {manualUrl && <input readOnly value={manualUrl} aria-label={t("cadastru.shareReport")}
        onFocus={(event) => event.target.select()} className="w-64 rounded-lg border border-emerald-200 bg-white p-2 text-xs" />}
    </div>
  );
}

"use client";

import { useTranslation } from "@/context/LanguageContext";

function SourceIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 3v5c0 4.5-2.9 8.5-7 10-4.1-1.5-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export default function CadastruSourceNote() {
  const { t } = useTranslation();

  return (
    <div className="mt-6 flex items-center gap-4 px-1 py-1 text-sm text-green-900">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
        <SourceIcon />
      </span>
      <p className="text-base leading-6">
        {t("cadastru.sourceNote")}{" "}
        <a
          href="https://ipcbi.gov.md"
          target="_blank"
          rel="noreferrer"
          className="font-semibold underline-offset-2 hover:underline"
        >
          ipcbi.gov.md
        </a>
      </p>
    </div>
  );
}

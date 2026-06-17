"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/context/LanguageContext";
import AuthOptions from "@/components/AuthOptions";
import CloseIcon from "@/components/icons/CloseIcon";

export default function AuthRequiredModal({
  open,
  copyKey = "result.comingSoon",
  showAuthOptions = true,
  showCopy = true,
  children = null,
  onClose,
}) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-w-md w-full rounded-2xl overflow-hidden shadow-2xl bg-white p-6 sm:p-7 cursor-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <CloseIcon size={18} />
        </button>

        {showCopy && (
          <p className={`text-center text-base font-medium text-gray-800 px-8 ${showAuthOptions || children ? "mb-4" : "mb-0"}`}>
            {t(copyKey)}
          </p>
        )}

        {children && (
          <div className={showAuthOptions ? "mb-4" : ""}>
            {children}
          </div>
        )}

        {showAuthOptions && <AuthOptions />}
      </div>
    </div>,
    document.body
  );
}

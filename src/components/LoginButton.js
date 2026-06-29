"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import AuthOptions from "@/components/AuthOptions";
import CloseIcon from "@/components/icons/CloseIcon";
import { useRouter } from "next/navigation";

export default function LoginButton({ className = "", menuAlign = "right", onPress }) {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    isAuthenticated,
    loading,
    clearAuthError,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuClass =
    menuAlign === "left"
      ? "left-0"
      : "right-0";

  const isLoggedIn = !!isAuthenticated;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={async () => {
          onPress?.();
          clearAuthError();
          if (isLoggedIn) {
            router.push('/profile');
            return;
          }
          setOpen((prev) => !prev);
        }}
        disabled={loading}
        className={`text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors cursor-pointer ${className}`}
      >
        {isLoggedIn ? t("nav.profile") : t("nav.login")}
      </button>

      {!isLoggedIn && open && (
        <>
          <div className={`absolute ${menuClass} z-50 mt-2 hidden w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg md:block`}>
            <AuthOptions />
          </div>

          <div className="fixed inset-0 z-[70] md:hidden">
            <button
              type="button"
              aria-label={t("notifications.close")}
              className="absolute inset-0 h-full w-full cursor-default bg-gray-950/30"
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-x-4 top-24 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-gray-950">{t("nav.login")}</p>
                <button
                  type="button"
                  aria-label={t("notifications.close")}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <AuthOptions />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

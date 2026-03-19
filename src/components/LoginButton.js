"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import GoogleIcon from "@/components/icons/GoogleIcon";
import FacebookIcon from "@/components/icons/FacebookIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";

export default function LoginButton({ className = "", menuAlign = "right" }) {
  const { t } = useTranslation();
  const {
    user,
    isAuthenticated,
    loading,
    error,
    activeProvider,
    signInWithGoogle,
    signInWithFacebook,
    signInWithTelegram,
    signOut,
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
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const menuClass =
    menuAlign === "left"
      ? "left-0"
      : "right-0";

  const disabled = loading || !!activeProvider;
  const isLoggedIn = !!isAuthenticated;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={async () => {
          clearAuthError();
          if (isLoggedIn) {
            await signOut();
            setOpen(false);
            return;
          }
          setOpen((prev) => !prev);
        }}
        disabled={loading}
        className={`text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors ${className}`}
      >
        {isLoggedIn ? "Logout" : "Login"}
      </button>

      {!isLoggedIn && open && (
        <div className={`absolute ${menuClass} mt-2 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg z-50`}>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              await signInWithGoogle();
            }}
            aria-label={t("auth.loginWithGoogle")}
            aria-busy={activeProvider === "google"}
            className="w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2.5 whitespace-nowrap">
              <GoogleIcon size={16} className="text-[#4285F4]" />
              <span>{activeProvider === "google" ? t("auth.loading") : t("auth.loginWithGoogle")}</span>
            </span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              await signInWithFacebook();
            }}
            aria-label={t("auth.loginWithFacebook")}
            aria-busy={activeProvider === "facebook"}
            className="mt-2 w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2.5 whitespace-nowrap">
              <FacebookIcon size={16} className="text-[#1877F2]" />
              <span>{activeProvider === "facebook" ? t("auth.loading") : t("auth.loginWithFacebook")}</span>
            </span>
          </button>
          {/* <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              await signInWithTelegram();
            }}
            aria-label={t("auth.loginWithTelegram")}
            aria-busy={activeProvider === "telegram"}
            className="mt-2 w-full rounded-full border border-[#229ED9] bg-[#229ED9] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1e8bc1] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2.5 whitespace-nowrap">
              <TelegramIcon size={16} stroke="#FFFFFF" />
              <span>{activeProvider === "telegram" ? t("auth.loading") : t("auth.loginWithTelegram")}</span>
            </span>
          </button> */}

          {error && (
            <p className="px-2 pt-1 text-xs text-red-500">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

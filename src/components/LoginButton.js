"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import AuthOptions from "@/components/AuthOptions";
import { useRouter } from "next/navigation";

export default function LoginButton({ className = "", menuAlign = "right" }) {
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
    return () => document.removeEventListener("mousedown", onPointerDown);
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
        <div className={`absolute ${menuClass} mt-2 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-lg z-50`}>
          <AuthOptions />
        </div>
      )}
    </div>
  );
}

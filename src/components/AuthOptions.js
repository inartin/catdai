"use client";

import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import GoogleIcon from "@/components/icons/GoogleIcon";
import FacebookIcon from "@/components/icons/FacebookIcon";

export default function AuthOptions({ className = "", variant = "default" }) {
  const { t } = useTranslation();
  const {
    loading,
    error,
    activeProvider,
    signInWithGoogle,
    signInWithFacebook,
    clearAuthError,
  } = useAuth();

  const disabled = loading || !!activeProvider;
  const googleLabel =
    variant === "freeContinue"
      ? t("auth.continueFreeWithGoogle")
      : t("auth.loginWithGoogle");
  const facebookLabel =
    variant === "freeContinue"
      ? t("auth.continueFreeWithFacebook")
      : t("auth.loginWithFacebook");

  const signIn = async (providerFn) => {
    clearAuthError();
    await providerFn();
  };

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => signIn(signInWithGoogle)}
        aria-label={googleLabel}
        aria-busy={activeProvider === "google"}
        className="w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center justify-center gap-2.5 whitespace-nowrap">
          <GoogleIcon size={16} />
          <span>{activeProvider === "google" ? t("auth.loading") : googleLabel}</span>
        </span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => signIn(signInWithFacebook)}
        aria-label={facebookLabel}
        aria-busy={activeProvider === "facebook"}
        className="mt-2 w-full rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="flex items-center justify-center gap-2.5 whitespace-nowrap">
          <FacebookIcon size={16} className="text-[#1877F2]" />
          <span>{activeProvider === "facebook" ? t("auth.loading") : facebookLabel}</span>
        </span>
      </button>

      {error && (
        <p className="px-2 pt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

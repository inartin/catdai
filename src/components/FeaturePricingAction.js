"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";

function formatEuro(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${amount.toLocaleString("ro-MD", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

function formatMdl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `≈ ${Math.round(amount).toLocaleString("ro-MD")} MDL`;
}

function getReturnPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

export default function FeaturePricingAction({
  offer,
  className = "",
  onCheckoutStart,
  onCheckoutError,
}) {
  const { t, lang } = useTranslation();
  const { session } = useAuth();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  if (!offer?.product_key || !offer?.price_eur || !offer?.price_mdl) return null;

  const startCheckout = async () => {
    if (!session?.access_token) return;
    setStatus("loading");
    setMessage("");
    onCheckoutStart?.();

    try {
      const response = await fetch("/api/payments/paddle/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_key: offer.product_key,
          lang,
          return_to: getReturnPath(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("payment.checkoutError"));
      }

      const checkoutUrl = payload?.checkout?.url;
      if (!checkoutUrl) throw new Error(t("payment.checkoutError"));

      setStatus("redirecting");
      window.location.href = checkoutUrl;
    } catch (error) {
      const errorMessage = error?.message || t("payment.checkoutError");
      setStatus("error");
      setMessage(errorMessage);
      onCheckoutError?.(errorMessage);
    }
  };

  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 text-center shadow-sm ${className}`}>
      <div className="mb-3 rounded-xl bg-gray-50 px-4 py-3">
        <p className="text-4xl font-extrabold tracking-tight text-gray-950">
          {formatEuro(offer.price_eur)}
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-500">
          {formatMdl(offer.price_mdl)}
        </p>
      </div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={status === "loading" || status === "redirecting" || !session?.access_token}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-gray-900/10 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      >
        {status === "loading" || status === "redirecting" ? t("payment.checkoutLoading") : t("payment.buyAccess")}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
      {message && (
        <p className="mt-2 text-xs font-medium text-red-600">{message}</p>
      )}
    </div>
  );
}

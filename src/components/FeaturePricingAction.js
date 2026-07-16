"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { trackPaymentCheckoutEvent } from "@/lib/tracking";

function formatMdl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${Math.round(amount).toLocaleString("ro-MD")} lei`;
}

function formatEuroApprox(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `≈ ${amount.toLocaleString("ro-MD", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

function getReturnPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function buildPendingCheckoutUrl(productKey, lang) {
  const url = new URL("/payment/paddle/checkout", window.location.origin);
  url.searchParams.set("product_key", productKey);
  url.searchParams.set("lang", lang);
  const returnPath = getReturnPath();
  if (returnPath) url.searchParams.set("return_to", returnPath);
  return url.toString();
}

export default function FeaturePricingAction({
  offer,
  className = "",
  trackPopupOpen = false,
  onCheckoutStart,
  onCheckoutError,
}) {
  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const popupTrackedRef = useRef(false);

  const packageOffer = {
    product_key: "extra_pack",
    price_eur: process.env.NEXT_PUBLIC_PRICE_EXTRA_PACK_COST || 25,
    price_mdl: process.env.NEXT_PUBLIC_PRICE_EXTRA_PACK_MDL_COST || 499,
  };
  const includedFeatures = [
    t("pricing.featureSale"),
    t("pricing.featureRent"),
    t("pricing.feature999"),
    t("pricing.featureCadastru"),
    t("pricing.featureYield"),
    t("pricing.featurePdf"),
  ];

  useEffect(() => {
    if (authLoading) return;
    if (!trackPopupOpen || !offer?.product_key || popupTrackedRef.current) return;
    popupTrackedRef.current = true;
    trackPaymentCheckoutEvent("checkout_popup_opened", {
      accessToken: session?.access_token,
      product_key: packageOffer.product_key,
      source_product_key: offer.product_key,
    });
  }, [authLoading, offer?.product_key, packageOffer.product_key, session?.access_token, trackPopupOpen]);

  if (!offer?.product_key) return null;

  const startCheckout = async () => {
    if (!session?.access_token) {
      setStatus("redirecting");
      window.location.href = buildPendingCheckoutUrl(packageOffer.product_key, lang);
      return;
    }

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
          product_key: packageOffer.product_key,
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

      try {
        sessionStorage.setItem(`catdai:paddle-product:${payload.order_id}`, JSON.stringify(payload.product || {}));
      } catch {}

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
    <div className={`rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-left">
        <p className="text-lg font-extrabold tracking-tight text-gray-950">
          {t("payment.extraPackageTitle", { price: formatMdl(packageOffer.price_mdl) })}
        </p>
        <p className="mt-1 text-sm font-semibold text-gray-500">
          {formatEuroApprox(packageOffer.price_eur)}
        </p>
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">
          {t("payment.packageIncludesLabel")}
        </p>
        <ul className="mt-2 divide-y divide-gray-200 border-t border-gray-200">
          {includedFeatures.map((label) => (
            <li key={label} className="flex items-center gap-2 py-2.5">
              <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">50×</span>
              <span className="min-w-0 text-sm leading-5 text-gray-700">
                {label}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={authLoading || status === "loading" || status === "redirecting"}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/25 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      >
        {status === "loading" || status === "redirecting" ? t("payment.checkoutLoading") : t("payment.continueWithExtra")}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>
      <Link
        href="/pricing"
        className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        {t("payment.showAllPackages")}
      </Link>
      {message && (
        <p className="mt-2 text-xs font-medium text-red-600">{message}</p>
      )}
    </div>
  );
}

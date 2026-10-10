"use client";

import Link from "next/link";
import usePaymentProvider from "@/components/usePaymentProvider";
import { maibProduct } from "@/lib/maib/products.mjs";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { trackPaymentCheckoutEvent } from "@/lib/tracking";
import { paymentSiteOrigin } from "@/lib/payment-urls.mjs";

function formatMdl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${Math.round(amount).toLocaleString("ro-MD")} lei`;
}

function getReturnPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function buildPendingCheckoutUrl(productKey, lang) {
  const url = new URL("/payment/checkout", paymentSiteOrigin(window.location.origin));
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
  variant = "default",
}) {
  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const provider = usePaymentProvider();
  const [status, setStatus] = useState("idle");

  const popupTrackedRef = useRef(false);
  const isSingleOffer = provider === "maib" && offer?.product_key?.endsWith("_single") && !!maibProduct(offer.product_key);
  const selectedProductKey = isSingleOffer ? offer.product_key : "extra_pack";
  const selectedMaibProduct = maibProduct(selectedProductKey);
  const isCadastruOffer = variant === "cadastru" && isSingleOffer && selectedProductKey === "cadastru_lookup_single";

  const packageOffer = {
    product_key: selectedProductKey,
    price_mdl: provider === "maib" ? selectedMaibProduct.amount_mdl : process.env.NEXT_PUBLIC_PRICE_EXTRA_PACK_MDL_COST || 499,
  };
  const featureLabels = { sale_estimate: "pricing.featureSale", rent_estimate: "pricing.featureRent", listing_analysis: "pricing.feature999", cadastru_lookup: "pricing.featureCadastru", yield_calculator: "pricing.featureYield", pdf_report: "pricing.featurePdf" };
  const includedFeatures = isSingleOffer ? Object.keys(selectedMaibProduct.grants).map((feature) => t(featureLabels[feature])) : [
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

  const startCheckout = () => {
    setStatus("redirecting");
    onCheckoutStart?.();
    window.location.href = buildPendingCheckoutUrl(packageOffer.product_key, lang);
  };

  return (
    <div className={`${isCadastruOffer ? "" : "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"} ${className}`}>
      {isCadastruOffer ? (
        <>
          <h2 className="px-4 text-center text-2xl font-bold tracking-tight text-gray-950">
            {t("cadastru.purchaseTitle")}
          </h2>
          <p className="mt-6 border-b border-gray-200 pb-5 text-lg font-semibold text-gray-950">
            {t("cadastru.purchasePackage", { price: formatMdl(packageOffer.price_mdl) })}
          </p>
          <p className="mt-5 text-base font-medium text-gray-950">
            {t("cadastru.purchaseIncludes")}
          </p>
          <ul className="mb-7 mt-3 space-y-4">
            {["Official", "Property", "Nearby", "Transport"].map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-gray-900 sm:text-base">
                <span aria-hidden="true" className="shrink-0 font-semibold text-primary">✓</span>
                <span>{t(`cadastru.purchase${feature}`)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 text-left">
          <p className="text-lg font-extrabold tracking-tight text-gray-950">
            {t(isSingleOffer ? "maib.singleFeatureTitle" : provider === "maib" ? "maib.extraPackageTitle" : "payment.extraPackageTitle", { price: formatMdl(packageOffer.price_mdl) })}
          </p>
          <p className="mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">
            {t("payment.packageIncludesLabel")}
          </p>
          <ul className="mt-2 divide-y divide-gray-200 border-t border-gray-200">
            {includedFeatures.map((label) => (
              <li key={label} className="flex items-center gap-2 py-2.5">
                <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{isSingleOffer ? "1×" : "50×"}</span>
                <span className="min-w-0 text-sm leading-5 text-gray-700">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={startCheckout}
        disabled={authLoading || status === "loading" || status === "redirecting"}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/25 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
      >
        {status === "loading" || status === "redirecting" ? t("payment.checkoutLoading") : isCadastruOffer ? t("cadastru.purchaseCta", { price: formatMdl(packageOffer.price_mdl) }) : t(isSingleOffer ? "maib.continueSingleFeature" : "payment.continueWithExtra")}
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
    </div>
  );
}

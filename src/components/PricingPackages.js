"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import usePaymentProvider from "@/components/usePaymentProvider";
import { maibProduct, MAX_SINGLE_QUANTITY } from "@/lib/maib/products.mjs";
import { paymentSiteOrigin } from "@/lib/payment-urls.mjs";
import { trackPaymentCheckoutEvent } from "@/lib/tracking";

export default function PricingPackages() {
  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const provider = usePaymentProvider();
  const trackedRef = useRef(false);
  const [selectedFeature, setSelectedFeature] = useState("cadastru_lookup");
  const [quantity, setQuantity] = useState(1);
  const recommendFivePack = quantity >= 4 && quantity <= 5;
  const recommendTwentyPack = quantity === 20;

  useEffect(() => {
    if (authLoading || trackedRef.current) return;
    trackedRef.current = true;
    trackPaymentCheckoutEvent("pricing_page_opened", {
      accessToken: session?.access_token,
    });
  }, [authLoading, session?.access_token]);

  const features = [
    ["cadastru_lookup", "pricing.featureCadastru"],
    ["sale_estimate", "pricing.featureSale"],
    ["rent_estimate", "pricing.featureRent"],
    ["listing_analysis", "pricing.feature999"],
    ["yield_calculator", "pricing.featureYield"],
    ["pdf_report", "pricing.featurePdf"],
  ];
  const offers = [
    { key: "single", productKey: `${selectedFeature}_single` },
    { key: "five", productKey: "all_features_5" },
    { key: "twenty", productKey: "all_features_20" },
  ];

  const startCheckout = (productKey, selectedQuantity = 1) => {
    const url = new URL("/payment/maib/checkout", paymentSiteOrigin(window.location.origin));
    url.searchParams.set("product_key", productKey);
    if (selectedQuantity > 1) url.searchParams.set("quantity", String(selectedQuantity));
    url.searchParams.set("lang", lang);
    window.location.assign(url.toString());
  };

  return (
    <section className="px-4 py-12 sm:py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">
            {t("pricing.eyebrow")}
          </p>
          <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
            {t("pricing.featuresSubtitle")}
          </p>
        </div>

        <div className="mt-10 grid items-stretch gap-4 gap-y-6 md:grid-cols-3">
          {offers.map(({ key, productKey }) => {
            const single = key === "single";
            const product = maibProduct(productKey, single ? quantity : 1);
            const numberLocale = lang === "ru" ? "ru-MD" : "ro-MD";
            const price = product.amount_mdl.toLocaleString(numberLocale, { maximumFractionDigits: 2 });
            return (
              <article key={key} className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                {single ? (
                  <>
                    <h2 className="sr-only">{t(quantity > 1 ? "pricing.individualUses" : "pricing.features.single.title", { count: quantity })}</h2>
                    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center rounded-lg border border-gray-200" role="group" aria-label={t("maib.quantity")}>
                          <button
                            type="button"
                            onClick={() => setQuantity(value => Math.max(1, value - 1))}
                            disabled={quantity === 1}
                            aria-label={t("pricing.decreaseQuantity")}
                            className="h-8 w-8 cursor-pointer rounded-l-lg text-lg font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                          >−</button>
                          <span aria-live="polite" className="min-w-8 text-center text-sm font-semibold tabular-nums text-gray-950">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQuantity(value => Math.min(MAX_SINGLE_QUANTITY, value + 1))}
                            disabled={quantity === MAX_SINGLE_QUANTITY}
                            aria-label={t("pricing.increaseQuantity")}
                            className="h-8 w-8 cursor-pointer rounded-r-lg text-lg font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                          >+</button>
                        </div>
                        {(lang !== "ru" || quantity === 1) && (
                          <span className="text-sm font-semibold text-gray-950">{t(`pricing.quantityUnit.${new Intl.PluralRules(lang).select(quantity)}`)}</span>
                        )}
                      </div>
                      {product.discount_mdl > 0 && (
                        <span className="ml-auto shrink-0 text-right text-sm font-semibold tabular-nums text-primary">{t("pricing.quantitySavings", { percent: product.discount_percent, amount: product.discount_mdl.toLocaleString(numberLocale, { maximumFractionDigits: 2 }) })}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <h2 className="min-h-10 text-base font-extrabold text-gray-950">{t(`pricing.features.${key}.title`)}</h2>
                )}
                <p className="mt-4 text-4xl font-extrabold tracking-tight text-gray-950">
                  {price} <span className="text-xl">MDL</span>
                </p>
                <p className="mt-3 min-h-10 text-sm leading-5 text-gray-500">
                  {t(`pricing.features.${key}.desc`)}
                </p>
                {single && (recommendFivePack || recommendTwentyPack) && (
                  <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3.5 text-sm leading-5 text-gray-700">
                    <p>{t(recommendTwentyPack ? "pricing.twentyPackRecommendation" : "pricing.fivePackRecommendation")}</p>
                    {provider === "maib" && (
                      <button type="button" onClick={() => startCheckout(recommendTwentyPack ? "all_features_20" : "all_features_5")} className="mt-2 cursor-pointer text-left font-semibold text-primary hover:underline">
                        {t(recommendTwentyPack ? "pricing.chooseTwentyPack" : "pricing.chooseFivePack")} →
                      </button>
                    )}
                  </div>
                )}
                <fieldset className="mt-5 flex-1 border-t border-gray-100">
                  <legend className="sr-only">{t(single ? "pricing.selectOneFeature" : "payment.packageIncludesLabel")}</legend>
                  {features.map(([feature, label]) => (
                    <div key={feature} className="border-b border-gray-100 last:border-b-0">
                      {single ? (
                        <label className="flex min-h-14 cursor-pointer items-center gap-2.5 py-2.5 text-sm leading-5 text-gray-700">
                          <input
                            type="radio"
                            name="single-feature"
                            value={feature}
                            checked={selectedFeature === feature}
                            onChange={() => setSelectedFeature(feature)}
                            className="h-4 w-4 shrink-0 accent-green-700"
                          />
                          <span className="flex-1">{t(label)}</span>
                          <span className="font-bold tabular-nums text-gray-900">{quantity}</span>
                        </label>
                      ) : (
                        <div className="flex min-h-14 items-center gap-2.5 py-2.5 text-sm leading-5 text-gray-700">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500" aria-hidden="true">
                            <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5 8.2 14 16 5.5" /></svg>
                          </span>
                          <span className="flex-1">{t(label)}</span>
                          <span className="font-bold tabular-nums text-gray-900">{product.grants[feature]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </fieldset>
                {single && selectedFeature === "pdf_report" && (
                  <p className="mt-5 text-xs leading-5 text-gray-500">
                    {t("pricing.pdfOnlyNote")}
                  </p>
                )}
                {single && (
                  <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-sm leading-5 text-gray-900">
                    <span>{t(`pricing.selection.${selectedFeature}.${new Intl.PluralRules(lang).select(quantity)}`, { count: quantity })}</span>
                    <strong className="shrink-0 tabular-nums">{price} lei</strong>
                  </div>
                )}
                {provider === "maib" && (
                  <button
                    type="button"
                    onClick={() => startCheckout(productKey, single ? quantity : 1)}
                    className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-gray-800"
                  >
                    {t("pricing.previewBuy")}
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-gray-500">
          {t(provider === "maib" ? "pricing.previewDelivery" : "pricing.previewMaibUnavailable")}
        </p>
      </div>
    </section>
  );
}

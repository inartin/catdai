"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import usePaymentProvider from "@/components/usePaymentProvider";
import { maibProduct } from "@/lib/maib/products.mjs";
import { paymentSiteOrigin } from "@/lib/payment-urls.mjs";
import { trackPaymentCheckoutEvent } from "@/lib/tracking";

export default function PricingPackages() {
  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const provider = usePaymentProvider();
  const trackedRef = useRef(false);
  useEffect(() => {
    if (authLoading || trackedRef.current) return;
    trackedRef.current = true;
    trackPaymentCheckoutEvent("pricing_page_opened", {
      accessToken: session?.access_token,
    });
  }, [authLoading, session?.access_token]);

  const offers = [
    { key: "single", productKey: "cadastru_lookup_single" },
    { key: "five", productKey: "all_features_5" },
    { key: "twenty", productKey: "all_features_20" },
  ];

  const startCheckout = (productKey) => {
    const url = new URL("/payment/maib/checkout", paymentSiteOrigin(window.location.origin));
    url.searchParams.set("product_key", productKey);
    url.searchParams.set("checkout_source", "pricing");
    url.searchParams.set("lang", lang);
    window.location.assign(url.toString());
  };

  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{t("pricing.sharedTitle")}</h1>
          <p className="mt-4 text-base leading-7 text-gray-500">{t("pricing.sharedSubtitle")}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
          {offers.map(({ key, productKey }) => {
            const product = maibProduct(productKey);
            const uses = Object.values(product.grants).reduce((sum, count) => sum + count, 0);
            const recommended = key === "single";
            const locale = lang === "ru" ? "ru-MD" : "ro-MD";
            const unitPrice = (product.amount_mdl / uses).toLocaleString(locale, {
              minimumFractionDigits: uses === 1 ? 0 : 2, maximumFractionDigits: 2,
            });
            return (
              <article key={key} className={`flex flex-col rounded-2xl border bg-white p-6 sm:p-7 ${recommended ? "border-primary shadow-sm ring-1 ring-primary/10" : "border-gray-200"}`}>
                <p className={`text-sm font-semibold ${recommended ? "text-primary" : "text-gray-500"}`}>{t(`pricing.shared.${key}.label`)}</p>
                <h2 className="mt-7 text-3xl font-bold tracking-tight text-gray-950">{t(`pricing.shared.${key}.uses`)}</h2>
                <p className="mt-6 text-2xl font-semibold tracking-tight text-gray-900">{product.amount_mdl} <span className="text-base font-medium text-gray-500">MDL</span></p>
                <p className="mt-2 text-sm text-gray-500">{t("pricing.sharedUnitPrice", { price: unitPrice })}</p>
                {provider === "maib" && (
                  <button type="button" onClick={() => startCheckout(productKey)}
                    className={`mt-8 inline-flex w-full cursor-pointer items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${recommended ? "border-primary bg-primary text-white hover:border-primary-dark hover:bg-primary-dark" : "border-primary bg-white text-primary-dark hover:bg-primary/5 active:bg-primary/10"}`}
                    aria-label={`${t("pricing.sharedChoose")} — ${t(`pricing.shared.${key}.uses`)}`}>
                    {t("pricing.sharedChoose")}
                  </button>
                )}
              </article>
            );
          })}
        </div>
        <div className="mx-auto mt-8 max-w-2xl text-center text-sm leading-6 text-gray-500">
          <h2 className="font-semibold text-gray-800">{t("pricing.sharedHow")}</h2>
          <p className="mt-2">{t("pricing.sharedExplanation")}</p>
          <p className="mt-1">{t(provider === "maib" ? "pricing.sharedDelivery" : "pricing.previewMaibUnavailable")}</p>
        </div>
      </div>
    </section>
  );
}

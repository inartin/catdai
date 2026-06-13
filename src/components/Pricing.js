"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";

function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10.5 8.2 14 16 5.5" />
    </svg>
  );
}

function formatPrice(value) {
  return `${value} lei`;
}

function FeatureRow({ feature, featured }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
            featured ? "bg-primary/15 text-primary-dark" : "bg-gray-100 text-gray-500"
          }`}
        >
          <CheckIcon className="h-3 w-3" />
        </span>
        <span className="min-w-0 text-sm leading-5 text-gray-700">
          {feature.label}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span
          className={`text-sm font-bold tabular-nums ${
            featured ? "text-primary-dark" : "text-gray-900"
          }`}
        >
          {feature.limit}
          {feature.hasAsterisk && (
            <sup className="ml-0.5 text-[10px] font-bold text-gray-400">*</sup>
          )}
        </span>
        {feature.limitMeta && (
          <span className="block text-[11px] font-medium leading-4 text-gray-400">
            {feature.limitMeta}
          </span>
        )}
      </span>
    </li>
  );
}

function getReturnPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function PriceCard({ plan, featured = false, checkoutState, onCheckout }) {
  const priceLabel = plan.price === 0 ? plan.priceLabel : formatPrice(plan.price);
  const isBusy = checkoutState.productKey === plan.productKey
    && (checkoutState.status === "loading" || checkoutState.status === "redirecting");

  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl bg-white p-6 transition-shadow duration-200 ${
        featured
          ? "border-2 border-primary shadow-[0_24px_60px_-12px_rgba(46,125,50,0.3)]"
          : "border border-gray-200 shadow-sm hover:shadow-md"
      }`}
    >
      {featured && plan.badge && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3.5 py-1 text-xs font-bold text-white shadow-sm">
          {plan.badge}
        </span>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-extrabold text-gray-900">{plan.title}</h3>
        {!featured && plan.badge && (
          <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
            {plan.badge}
          </span>
        )}
      </div>

      <p className="mt-4 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold tracking-tight text-gray-950">
          {priceLabel}
          {plan.priceHasAsterisk && (
            <sup className="ml-0.5 text-base font-bold text-gray-400">*</sup>
          )}
        </span>
      </p>

      <p className="mt-3 min-h-10 text-sm leading-5 text-gray-500">
        {plan.description}
      </p>

      <ul className="mt-5 flex-1 divide-y divide-gray-100 border-t border-gray-100">
        {plan.features.map((feature) => (
          <FeatureRow key={feature.label} feature={feature} featured={featured} />
        ))}
      </ul>

      <p
        className={`mt-5 rounded-xl px-3.5 py-2.5 text-xs font-semibold leading-5 ${
          featured ? "bg-primary/10 text-primary-dark" : "bg-gray-50 text-gray-500"
        }`}
      >
        {plan.note}
      </p>

      {plan.productKey && (
        <>
          <button
            type="button"
            onClick={() => onCheckout(plan.productKey)}
            disabled={isBusy}
            className={`mt-4 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 ${
              featured
                ? "bg-primary text-white hover:bg-primary-dark"
                : "bg-gray-950 text-white hover:bg-gray-800"
            }`}
          >
            {isBusy ? plan.loadingLabel : plan.actionLabel}
          </button>
          {checkoutState.productKey === plan.productKey && checkoutState.message && (
            <p className="mt-2 text-xs font-medium text-red-600">{checkoutState.message}</p>
          )}
        </>
      )}
    </article>
  );
}

export default function Pricing({ prices, compact = false }) {
  const { t, lang } = useTranslation();
  const { session } = useAuth();
  const [checkoutState, setCheckoutState] = useState({
    status: "idle",
    productKey: null,
    message: "",
  });

  const featureLabels = {
    sale: t("pricing.featureSale"),
    rent: t("pricing.featureRent"),
    listing: t("pricing.feature999"),
    cadastru: t("pricing.featureCadastru"),
    yield: t("pricing.featureYield"),
    pdf: t("pricing.featurePdf"),
  };

  const makeFeatures = (limit) => Object.values(featureLabels).map((label) => ({
    label,
    limit,
  }));

  const plans = [
    {
      key: "free",
      price: 0,
      priceLabel: t("pricing.freePrice"),
      priceHasAsterisk: true,
      title: t("pricing.freeTitle"),
      description: t("pricing.freeDesc"),
      note: t("pricing.freeNote"),
      features: [
        {
          label: featureLabels.sale,
          limit: t("pricing.freeMonthlyLimit", { count: 2 }),
          limitMeta: "0 lei",
        },
        {
          label: featureLabels.rent,
          limit: t("pricing.freeMonthlyLimit", { count: 2 }),
          limitMeta: "0 lei",
        },
        {
          label: featureLabels.listing,
          limit: "30 lei",
          hasAsterisk: true,
        },
        {
          label: featureLabels.cadastru,
          limit: "10 lei",
          hasAsterisk: true,
        },
        {
          label: featureLabels.yield,
          limit: "30 lei",
          hasAsterisk: true,
        },
        {
          label: featureLabels.pdf,
          limit: "30 lei",
          hasAsterisk: true,
        },
      ],
    },
    {
      key: "standard",
      productKey: "standard_pack",
      price: prices.standard,
      title: t("pricing.standardTitle"),
      description: t("pricing.standardDesc"),
      badge: t("pricing.standardBadge"),
      note: t("pricing.noTimeLimit"),
      features: makeFeatures("2"),
      actionLabel: t("pricing.choosePlan"),
      loadingLabel: t("payment.checkoutLoading"),
    },
    {
      key: "pro",
      productKey: "pro_pack",
      price: prices.pro,
      title: t("pricing.proTitle"),
      description: t("pricing.proDesc"),
      badge: t("pricing.proBadge"),
      note: t("pricing.noTimeLimit"),
      features: makeFeatures("10"),
      actionLabel: t("pricing.choosePlan"),
      loadingLabel: t("payment.checkoutLoading"),
    },
    {
      key: "extra",
      productKey: "extra_pack",
      price: prices.extra,
      title: t("pricing.extraTitle"),
      description: t("pricing.extraDesc"),
      badge: t("pricing.extraBadge"),
      note: t("pricing.extraNote"),
      features: makeFeatures("50"),
      actionLabel: t("pricing.choosePlan"),
      loadingLabel: t("payment.checkoutLoading"),
    },
  ];

  const startCheckout = async (productKey) => {
    if (!session?.access_token) {
      setCheckoutState({
        status: "error",
        productKey,
        message: t("payment.loginRequiredForCheckout"),
      });
      return;
    }

    setCheckoutState({ status: "loading", productKey, message: "" });

    try {
      const response = await fetch("/api/payments/paddle/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_key: productKey,
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

      setCheckoutState({ status: "redirecting", productKey, message: "" });
      window.location.href = checkoutUrl;
    } catch (error) {
      setCheckoutState({
        status: "error",
        productKey,
        message: error?.message || t("payment.checkoutError"),
      });
    }
  };

  return (
    <section className={compact ? "px-4 pb-16" : "px-4 py-12 sm:py-16"}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">
            {t("pricing.eyebrow")}
          </p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-gray-950 sm:text-3xl">
            {t("pricing.title")}
          </h2>
          <p className="mt-3 text-base leading-7 text-gray-600">
            {t("pricing.subtitle")}
          </p>
        </div>

        <div className="mt-10 grid items-stretch gap-4 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PriceCard
              key={plan.key}
              plan={plan}
              featured={plan.key === "pro"}
              checkoutState={checkoutState}
              onCheckout={startCheckout}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

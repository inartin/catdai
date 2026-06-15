"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import CloseIcon from "@/components/icons/CloseIcon";

const MAX_CUSTOM_REQUEST_LENGTH = 500;
const MAX_CUSTOM_REQUEST_BODY_LENGTH = 340;

function sanitizeText(value, maxLength = MAX_CUSTOM_REQUEST_LENGTH) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

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

function formatEuroPrice(value) {
  return Number.isInteger(value) ? value : value.toFixed(2).replace(/\.?0+$/, "");
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
      {plan.eurPrice !== null && plan.eurPrice !== undefined && (
        <p className="mt-1 text-sm font-semibold text-gray-500">
          ≈ {formatEuroPrice(plan.eurPrice)} €
        </p>
      )}

      <p className="mt-3 min-h-10 text-sm leading-5 text-gray-500">
        {plan.description}
      </p>

      <ul className="mt-5 flex-1 divide-y divide-gray-100 border-t border-gray-100">
        {plan.features.map((feature) => (
          <FeatureRow key={feature.label} feature={feature} featured={featured} />
        ))}
      </ul>

      {plan.note && (
        <p
          className={`mt-5 rounded-xl px-3.5 py-2.5 text-xs font-semibold leading-5 ${
            featured ? "bg-primary/10 text-primary-dark" : "bg-gray-50 text-gray-500"
          }`}
        >
          {plan.note}
        </p>
      )}

      {plan.productKey && (
        <>
          <button
            type="button"
            onClick={() => onCheckout(plan.productKey)}
            disabled={isBusy}
            className={`inline-flex w-full cursor-pointer items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 ${
              plan.note ? "mt-4" : "mt-5"
            } ${
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

function CustomRequestCard({ onOpen }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-6 flex w-full cursor-pointer flex-col items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center"
    >
      <span>
        <span className="block text-base font-extrabold text-gray-950">
          {t("pricing.customRequestTitle")}
        </span>
        <span className="mt-1 block max-w-2xl text-sm leading-5 text-gray-600">
          {t("pricing.customRequestDesc")}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-bold text-white">
        {t("pricing.customRequestAction")}
      </span>
    </button>
  );
}

function CustomRequestModal({ open, onClose }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  if (!open) return null;

  const remaining = MAX_CUSTOM_REQUEST_BODY_LENGTH - message.length;
  const canSubmit = status !== "submitting" && message.trim() && email.trim();

  const resetForm = () => {
    setMessage("");
    setEmail("");
    setPhone("");
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanMessage = sanitizeText(message, MAX_CUSTOM_REQUEST_BODY_LENGTH).trim();
    const cleanEmail = sanitizeText(email, 120).trim();
    const cleanPhone = sanitizeText(phone, 60).trim();

    if (!cleanMessage) {
      setError(t("pricing.customRequestMessageRequired"));
      return;
    }

    if (!cleanEmail) {
      setError(t("pricing.customRequestEmailRequired"));
      return;
    }

    setStatus("submitting");
    setError("");

    try {
      const details = [
        t("pricing.customRequestFeedbackPrefix"),
        "",
        cleanMessage,
      ];

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          kind: "pricing_custom_request",
          message: details.join("\n"),
          contact_email: cleanEmail,
          contact_phone: cleanPhone || undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || t("pricing.customRequestSubmitError"));
      }

      resetForm();
      setStatus("sent");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError.message || t("pricing.customRequestSubmitError"));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer"
        aria-label={t("pricing.customRequestClose")}
        onClick={onClose}
      />
      <section className="relative w-[min(calc(100vw-2rem),440px)] rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-950">
              {t("pricing.customRequestModalTitle")}
            </h2>
            <p className="mt-1 text-sm leading-5 text-gray-600">
              {status === "sent" ? t("pricing.customRequestThankYou") : t("pricing.customRequestModalDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label={t("pricing.customRequestClose")}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {status === "sent" ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800">
            {t("pricing.customRequestSentTitle")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-sm font-medium text-gray-800" htmlFor="catdai-custom-request-message">
              {t("pricing.customRequestMessageLabel")}
            </label>
            <textarea
              id="catdai-custom-request-message"
              value={message}
              onChange={(event) => {
                setMessage(sanitizeText(event.target.value, MAX_CUSTOM_REQUEST_BODY_LENGTH));
                setStatus("idle");
                setError("");
              }}
              maxLength={MAX_CUSTOM_REQUEST_BODY_LENGTH}
              rows={5}
              className="block w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={t("pricing.customRequestMessagePlaceholder")}
            />
            <div className="text-xs text-gray-500">
              {t("feedback.characterCount", { count: remaining })}
            </div>

            <label className="block text-sm font-medium text-gray-800" htmlFor="catdai-custom-request-email">
              {t("pricing.customRequestEmailLabel")}
            </label>
            <input
              id="catdai-custom-request-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(sanitizeText(event.target.value, 120));
                setStatus("idle");
                setError("");
              }}
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={t("pricing.customRequestEmailPlaceholder")}
            />

            <label className="block text-sm font-medium text-gray-800" htmlFor="catdai-custom-request-phone">
              {t("pricing.customRequestPhoneLabel")}
            </label>
            <input
              id="catdai-custom-request-phone"
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(sanitizeText(event.target.value, 60));
                setStatus("idle");
                setError("");
              }}
              className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-5 text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder={t("pricing.customRequestPhonePlaceholder")}
            />

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {status === "submitting" ? t("feedback.submitting") : t("pricing.customRequestSubmit")}
            </button>
          </form>
        )}
      </section>
    </div>
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
  const [customRequestOpen, setCustomRequestOpen] = useState(false);

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
      price: prices.standard.mdl,
      eurPrice: prices.standard.eur,
      title: t("pricing.standardTitle"),
      description: t("pricing.standardDesc"),
      note: t("pricing.paidPackageNote"),
      features: makeFeatures("2"),
      actionLabel: t("pricing.choosePlan"),
      loadingLabel: t("payment.checkoutLoading"),
    },
    {
      key: "pro",
      productKey: "pro_pack",
      price: prices.pro.mdl,
      eurPrice: prices.pro.eur,
      title: t("pricing.proTitle"),
      description: t("pricing.proDesc"),
      badge: t("pricing.proBadge"),
      note: t("pricing.paidPackageNote"),
      features: makeFeatures("10"),
      actionLabel: t("pricing.choosePlan"),
      loadingLabel: t("payment.checkoutLoading"),
    },
    {
      key: "extra",
      productKey: "extra_pack",
      price: prices.extra.mdl,
      eurPrice: prices.extra.eur,
      title: t("pricing.extraTitle"),
      description: t("pricing.extraDesc"),
      note: t("pricing.paidPackageNote"),
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

      try {
        sessionStorage.setItem(`catdai:paddle-product:${payload.order_id}`, JSON.stringify(payload.product || {}));
      } catch {}

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
    <section className={compact ? "px-4 pb-16" : "px-4 py-12 sm:py-6"}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">
            {t("pricing.eyebrow")}
          </p>
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
        <CustomRequestCard onOpen={() => setCustomRequestOpen(true)} />
      </div>
      <CustomRequestModal
        open={customRequestOpen}
        onClose={() => setCustomRequestOpen(false)}
      />
    </section>
  );
}

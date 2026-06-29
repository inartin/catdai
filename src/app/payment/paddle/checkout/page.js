"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { trackPaymentCheckoutEvent } from "@/lib/tracking";
import AuthOptions from "@/components/AuthOptions";
import LockIcon from "@/components/icons/LockIcon";

const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";
const PADDLE_INLINE_FRAME_TARGET = "paddle-inline-checkout";

function loadPaddleScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.Paddle) return Promise.resolve(window.Paddle);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PADDLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Paddle), { once: true });
      existing.addEventListener("error", () => reject(new Error("Paddle.js failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PADDLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(window.Paddle);
    script.onerror = () => reject(new Error("Paddle.js failed to load"));
    document.head.appendChild(script);
  });
}

function normalizeReturnTo(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/evaluare";

  try {
    const url = new URL(raw, "https://catdai.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/evaluare";
  }
}

function getCheckoutEmail(user) {
  const email = String(user?.email || "").trim();
  if (!email || /^telegram-\d+@auth\.catdai\.md$/i.test(email)) return "";
  return email;
}

function readStoredProduct(orderId) {
  if (typeof window === "undefined" || !orderId) return null;

  try {
    const raw = sessionStorage.getItem(`catdai:paddle-product:${orderId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function formatMoneyMdl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `≈ ${Math.round(amount).toLocaleString("ro-MD")} lei`;
}

function formatMoneyEur(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return `${amount.toLocaleString("ro-MD", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

function getConfiguredEurAmount(productKey) {
  const envByProduct = {
    standard_pack: process.env.NEXT_PUBLIC_PRICE_STANDARD_PACK_COST,
    pro_pack: process.env.NEXT_PUBLIC_PRICE_PRO_PACK_COST,
    extra_pack: process.env.NEXT_PUBLIC_PRICE_EXTRA_PACK_COST,
  };
  const amount = Number.parseFloat(String(envByProduct[productKey] || "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function getConfiguredMdlAmount(productKey) {
  const envByProduct = {
    standard_pack: process.env.NEXT_PUBLIC_PRICE_STANDARD_PACK_MDL_COST,
    pro_pack: process.env.NEXT_PUBLIC_PRICE_PRO_PACK_MDL_COST,
    extra_pack: process.env.NEXT_PUBLIC_PRICE_EXTRA_PACK_MDL_COST,
  };
  const amount = Number.parseFloat(String(envByProduct[productKey] || "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function getProductSummary(product, t) {
  const key = String(product?.key || product?.product_key || "").trim();
  const amountMdl = formatMoneyMdl(getConfiguredMdlAmount(key) || product?.amount_mdl);
  const amountEur = formatMoneyEur(product?.amount_eur || getConfiguredEurAmount(key));

  const summaries = {
    standard_pack: {
      title: t("profile.paymentProduct.standard_pack"),
      description: "",
      quantity: t("payment.checkoutProductAllFeatures", { count: 2 }),
    },
    pro_pack: {
      title: t("profile.paymentProduct.pro_pack"),
      description: "",
      quantity: t("payment.checkoutProductAllFeatures", { count: 10 }),
    },
    extra_pack: {
      title: t("profile.paymentProduct.extra_pack"),
      description: "",
      quantity: t("payment.checkoutProductAllFeatures", { count: 50 }),
    },
    sale_estimate_single: {
      title: t("profile.paymentProduct.sale_estimate_single"),
      description: t("pricing.featureSale"),
      quantity: t("payment.checkoutProductSingleUse"),
    },
    rent_estimate_single: {
      title: t("profile.paymentProduct.rent_estimate_single"),
      description: t("pricing.featureRent"),
      quantity: t("payment.checkoutProductSingleUse"),
    },
    listing_analysis_single: {
      title: t("profile.paymentProduct.listing_analysis_single"),
      description: t("pricing.feature999"),
      quantity: t("payment.checkoutProductSingleUse"),
    },
    cadastru_lookup_single: {
      title: t("profile.paymentProduct.cadastru_lookup_single"),
      description: t("pricing.featureCadastru"),
      quantity: t("payment.checkoutProductSingleUse"),
    },
    yield_calculator_single: {
      title: t("profile.paymentProduct.yield_calculator_single"),
      description: t("pricing.featureYield"),
      quantity: t("payment.checkoutProductSingleUse"),
    },
    pdf_report_single: {
      title: t("profile.paymentProduct.pdf_report_single"),
      description: t("pricing.featurePdf"),
      quantity: t("payment.checkoutProductSingleUse"),
    },
  };

  if (!summaries[key]) return null;

  return {
    ...summaries[key],
    amountPrimary: key === "extra_pack" && (amountEur || amountMdl) ? `${amountEur || amountMdl}/luna` : amountEur || amountMdl,
    amountSecondary: amountEur ? amountMdl : "",
  };
}

export default function PaddleCheckoutPage() {
  const { lang, setLang, t } = useTranslation();
  const { session, user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState("loading");
  const [messageKey, setMessageKey] = useState("payment.checkoutOpening");
  const [errorMessage, setErrorMessage] = useState("");
  const [product, setProduct] = useState(null);
  const checkoutPageTrackedRef = useRef(false);
  const checkoutEmail = getCheckoutEmail(user);

  const params = useMemo(() => {
    if (typeof window === "undefined") return { transactionId: "", orderId: "", productKey: "", returnTo: "", lang: "" };
    const searchParams = new URLSearchParams(window.location.search);
    return {
      transactionId: searchParams.get("_ptxn") || "",
      orderId: searchParams.get("order_id") || "",
      productKey: searchParams.get("product_key") || "",
      returnTo: searchParams.get("return_to") || "",
      lang: searchParams.get("lang") || "",
    };
  }, []);

  useEffect(() => {
    setProduct(readStoredProduct(params.orderId) || (params.productKey ? { key: params.productKey } : null));
  }, [params.orderId, params.productKey]);

  useEffect(() => {
    if (authLoading) return;
    if (checkoutPageTrackedRef.current) return;
    checkoutPageTrackedRef.current = true;
    trackPaymentCheckoutEvent("checkout_page_opened", {
      accessToken: session?.access_token,
      order_id: params.orderId,
      product_key: params.productKey,
      paddle_transaction_id: params.transactionId,
    });
  }, [authLoading, params.orderId, params.productKey, params.transactionId, session?.access_token]);

  useEffect(() => {
    if (authLoading || product?.key || !params.orderId || !session?.access_token) return undefined;

    let active = true;

    async function fetchProductFromOrder() {
      try {
        const searchParams = new URLSearchParams({ order_id: params.orderId });
        const response = await fetch(`/api/payments/paddle/status?${searchParams.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (!active || !response.ok || !payload?.product_key) return;
        setProduct({
          key: payload.product_key,
          amount_mdl: Number(payload.amount_minor) > 0 ? Number(payload.amount_minor) / 100 : null,
          amount_eur: getConfiguredEurAmount(payload.product_key),
        });
      } catch {}
    }

    fetchProductFromOrder();

    return () => {
      active = false;
    };
  }, [authLoading, params.orderId, product?.key, session?.access_token]);

  useEffect(() => {
    if (authLoading || params.transactionId || !params.productKey || !session?.access_token) return undefined;
    if ((params.lang === "ro" || params.lang === "ru") && params.lang !== lang) return undefined;

    let active = true;

    async function createCheckout() {
      setStatus("loading");
      setMessageKey("payment.checkoutOpening");
      setErrorMessage("");

      try {
        const response = await fetch("/api/payments/paddle/create", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product_key: params.productKey,
            lang,
            return_to: params.returnTo,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) throw new Error(payload?.error || t("payment.checkoutError"));

        const checkoutUrl = payload?.checkout?.url;
        if (!checkoutUrl) throw new Error(t("payment.checkoutError"));

        try {
          sessionStorage.setItem(`catdai:paddle-product:${payload.order_id}`, JSON.stringify(payload.product || {}));
        } catch {}

        window.location.replace(checkoutUrl);
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessageKey("payment.checkoutOpenFailed");
        setErrorMessage(error?.message || "");
      }
    }

    createCheckout();

    return () => {
      active = false;
    };
  }, [authLoading, lang, params.lang, params.productKey, params.returnTo, params.transactionId, session?.access_token, t]);

  useEffect(() => {
    if ((params.lang === "ro" || params.lang === "ru") && params.lang !== lang) {
      setLang(params.lang);
      return undefined;
    }

    let canceled = false;
    let redirected = false;

    function redirectToResult(result, eventTransactionId) {
      if (redirected || typeof window === "undefined") return;
      redirected = true;

      const url = new URL("/payment/paddle/success", window.location.origin);
      if (params.orderId) url.searchParams.set("order_id", params.orderId);
      url.searchParams.set("transaction_id", eventTransactionId || params.transactionId);
      url.searchParams.set("checkout", result);
      if (params.returnTo) url.searchParams.set("return_to", params.returnTo);
      url.searchParams.set("lang", lang);
      window.location.href = url.toString();
    }

    async function openCheckout() {
      if (authLoading) return;

      const canResumeAfterLogin = !!(params.productKey || params.transactionId || params.orderId);

      if (!session?.access_token && canResumeAfterLogin) {
        setStatus("auth_required");
        setMessageKey("payment.loginRequiredForCheckout");
        setErrorMessage("");
        return;
      }

      if (!params.transactionId && params.productKey) return;

      if (!params.transactionId) {
        setStatus("error");
        setMessageKey("payment.checkoutMissingTransaction");
        setErrorMessage("");
        return;
      }

      const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
      if (!token) {
        setStatus("error");
        setMessageKey("payment.checkoutMissingConfig");
        setErrorMessage("");
        return;
      }

      try {
        const Paddle = await loadPaddleScript();
        if (canceled) return;

        if (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT !== "production" && Paddle.Environment?.set) {
          Paddle.Environment.set("sandbox");
        }

        Paddle.Initialize({
          token,
          eventCallback(event) {
            if (!event?.name) return;

            if (event.name === "checkout.completed") {
              redirectToResult("completed", event?.data?.transaction_id);
              return;
            }

            if (event.name === "checkout.closed") {
              redirectToResult("closed", event?.data?.transaction_id);
            }
          },
          checkout: {
            settings: {
              displayMode: "inline",
              frameTarget: PADDLE_INLINE_FRAME_TARGET,
              frameInitialHeight: "520",
              frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: none;",
              theme: "light",
              locale: lang === "ru" ? "ru" : "en",
              allowLogout: false,
            },
          },
        });

        Paddle.Checkout.open({
          transactionId: params.transactionId,
          ...(checkoutEmail ? { customer: { email: checkoutEmail } } : {}),
        });
        setStatus("ready");
        setMessageKey("payment.checkoutReady");
        setErrorMessage("");
      } catch (error) {
        if (canceled) return;
        setStatus("error");
        setMessageKey("payment.checkoutOpenFailed");
        setErrorMessage(error?.message || "");
      }
    }

    openCheckout();

    return () => {
      canceled = true;
    };
  }, [authLoading, checkoutEmail, lang, params.lang, params.orderId, params.productKey, params.returnTo, params.transactionId, session?.access_token, setLang]);

  const returnHref = normalizeReturnTo(params.returnTo);
  const isError = status === "error";
  const isAuthRequired = status === "auth_required";
  const productSummary = getProductSummary(product, t);

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-gray-950">
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label={t("nav.homeAriaLabel")} className="flex items-center gap-3">
            <img src="/icon0.svg" alt="" className="h-11 w-auto object-contain" />
            <span className="text-lg font-semibold tracking-tight">Cât Dai?</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            <LockIcon size={14} strokeWidth={2.5} className="text-emerald-600" />
            {t("payment.secureLabel")}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-3 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid items-start gap-3 lg:gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="mb-3 flex items-center justify-between gap-4 lg:block lg:mb-6">
              <Link
                href={returnHref}
                className="group inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-950"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-4 w-4 transition-transform group-hover:-translate-x-1"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
                {t("form.back")}
              </Link>

              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-dark lg:mt-6 lg:text-sm">
                {t("payment.checkoutEyebrow")}
              </p>
            </div>
            <h1 className="max-w-2xl text-2xl font-bold leading-tight tracking-normal text-gray-950 sm:text-3xl lg:mt-2 lg:text-4xl">
              {t("payment.checkoutTitle")}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600 sm:text-base lg:mt-3">
              {t("payment.checkoutSubtitle")}
            </p>

            {productSummary && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:mt-8 lg:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-gray-950 lg:text-lg">{productSummary.title}</h2>
                    {productSummary.description && (
                      <p className="mt-1 text-xs leading-5 text-gray-500 lg:text-sm lg:leading-6 lg:text-gray-600">{productSummary.description}</p>
                    )}
                    {productSummary.quantity && (
                      <p className="mt-2.5 inline-flex rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-semibold text-primary-dark lg:mt-3 lg:px-3 lg:py-1">
                        {productSummary.quantity}
                      </p>
                    )}
                  </div>
                  {productSummary.amountPrimary && (
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-gray-950 lg:text-lg">{productSummary.amountPrimary}</p>
                      {productSummary.amountSecondary && (
                        <p className="mt-0.5 text-[10px] font-semibold text-gray-400 lg:text-xs lg:mt-1">{productSummary.amountSecondary}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:p-6">
            {(status !== "ready" || isError) && (
              <div className="mb-3 flex flex-col gap-1 lg:mb-6 lg:gap-1.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 flex-none rounded-full ${
                      isError ? "bg-red-500" : "bg-primary"
                    }`}
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-gray-950 lg:text-lg">
                    {isError ? t("payment.checkoutAttentionTitle") : t("payment.checkoutPanelTitle")}
                  </h2>
                </div>
                <p className="text-xs text-gray-500 lg:text-sm">{t(messageKey)}</p>
                {errorMessage && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {errorMessage}
                  </p>
                )}
              </div>
            )}

            {isAuthRequired ? (
              <div className="flex min-h-[520px] items-center justify-center">
                <AuthOptions className="w-full max-w-sm" />
              </div>
            ) : !isError && (
              <div
                className={`${PADDLE_INLINE_FRAME_TARGET} min-h-[520px] overflow-visible ${
                  status === "ready" ? "" : "mt-3 lg:mt-6"
                }`}
                aria-label={t("payment.checkoutFrameLabel")}
              />
            )}

            <div className="mt-3 border-t border-gray-100 pt-3 lg:mt-6 lg:pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400 lg:text-xs">
                {t("payment.nextStepLabel")}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500 lg:text-sm lg:leading-6 lg:text-gray-600">
                {isError
                  ? t("payment.checkoutErrorNextStep")
                  : isAuthRequired
                    ? t("payment.loginRequiredForCheckout")
                    : t("payment.checkoutNextStep")}
              </p>
            </div>

            {isError && (
              <Link
                href={returnHref}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 lg:mt-6"
              >
                {t("payment.backToEvaluation")}
              </Link>
            )}
          </div>
        </section>

        <div className="mt-3 mb-8 space-y-3">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary-light text-primary-dark">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
                  <path
                    d="M5.5 9h13M7 9v8.5M11 9v8.5M15 9v8.5M17 9v8.5M4.5 17.5h15M4 20h16M12 3.75 19 7H5l7-3.25Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.7"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-base font-semibold text-gray-950">
                  <span>{t("payment.checkoutProcessorTitlePrefix")}</span>
                  <img src="/brands/paddle.svg" alt="Paddle" className="h-4 w-auto" />
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-gray-700">{t("payment.checkoutProcessorDescription")}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[
                    { src: "/brands/visa_blue.svg", alt: "Visa", className: "h-auto w-[54px]" },
                    { src: "/brands/mastercard.svg", alt: "Mastercard", className: "h-[18px] w-auto" },
                    { src: "/brands/apple-pay.svg", alt: "Apple Pay", className: "h-[18px] w-auto" },
                    { src: "/brands/google-pay.svg?v=2", alt: "Google Pay", className: "h-5 w-[58px]" },
                  ].map((method) => (
                    <span
                      key={method.alt}
                      className="inline-flex h-8 w-[86px] items-center justify-center rounded-md border border-gray-200 bg-[#f7f8f5] px-2"
                    >
                      <img src={method.src} alt={method.alt} className={`${method.className} max-w-full object-contain`} />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary-light text-primary-dark">
              €
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-950">{t("payment.checkoutCurrencyTitle")}</h2>
                <p className="mt-1.5 text-sm leading-6 text-gray-700">{t("payment.checkoutCurrencyDescription")}</p>
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-gray-500">
                  <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-primary" aria-hidden="true" />
                  <span>{t("payment.checkoutCurrencyNote")}</span>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

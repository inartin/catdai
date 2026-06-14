"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";

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
    amountPrimary: amountEur || amountMdl,
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
  const checkoutEmail = getCheckoutEmail(user);

  const params = useMemo(() => {
    if (typeof window === "undefined") return { transactionId: "", orderId: "", returnTo: "", lang: "" };
    const searchParams = new URLSearchParams(window.location.search);
    return {
      transactionId: searchParams.get("_ptxn") || "",
      orderId: searchParams.get("order_id") || "",
      returnTo: searchParams.get("return_to") || "",
      lang: searchParams.get("lang") || "",
    };
  }, []);

  useEffect(() => {
    setProduct(readStoredProduct(params.orderId));
  }, [params.orderId]);

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
      if (authLoading) return;

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
  }, [authLoading, checkoutEmail, lang, params.lang, params.orderId, params.returnTo, params.transactionId, setLang]);

  const returnHref = normalizeReturnTo(params.returnTo);
  const isError = status === "error";
  const productSummary = getProductSummary(product, t);

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-4 py-8 text-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label={t("nav.homeAriaLabel")} className="inline-flex items-center gap-3">
            <img src="/icon0.svg" alt="" className="h-12 w-auto object-contain" />
            <span className="text-lg font-semibold tracking-tight">Cât Dai?</span>
          </Link>
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            {t("payment.secureLabel")}
          </span>
        </header>

        <section className="grid flex-1 items-start gap-8 py-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary-dark">
              {t("payment.checkoutEyebrow")}
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-normal text-gray-950 sm:text-5xl">
              {t("payment.checkoutTitle")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-gray-600">
              {t("payment.checkoutSubtitle")}
            </p>

            {productSummary && (
              <div className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-950">{productSummary.title}</h2>
                    {productSummary.description && (
                      <p className="mt-2 text-sm leading-6 text-gray-600">{productSummary.description}</p>
                    )}
                    {productSummary.quantity && (
                      <p className="mt-3 inline-flex rounded-full bg-primary-light px-3 py-1 text-xs font-semibold text-primary-dark">
                        {productSummary.quantity}
                      </p>
                    )}
                  </div>
                  {productSummary.amountPrimary && (
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold text-gray-950">{productSummary.amountPrimary}</p>
                      {productSummary.amountSecondary && (
                        <p className="mt-1 text-xs font-semibold text-gray-400">{productSummary.amountSecondary}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-start gap-4">
              <span
                className={`mt-1 h-3 w-3 flex-none rounded-full ${
                  isError ? "bg-red-500" : status === "ready" ? "bg-emerald-500" : "bg-primary"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-950">
                  {isError ? t("payment.checkoutAttentionTitle") : t("payment.checkoutPanelTitle")}
                </h2>
                <p className="mt-3 text-sm leading-6 text-gray-600">{t(messageKey)}</p>
                {errorMessage && (
                  <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>

            {!isError && (
              <div
                className={`${PADDLE_INLINE_FRAME_TARGET} mt-6 min-h-[520px] overflow-visible`}
                aria-label={t("payment.checkoutFrameLabel")}
              />
            )}

            <div className="mt-6 border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                {t("payment.nextStepLabel")}
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                {isError ? t("payment.checkoutErrorNextStep") : t("payment.checkoutNextStep")}
              </p>
            </div>

            {isError && (
              <Link
                href={returnHref}
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                {t("payment.backToEvaluation")}
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

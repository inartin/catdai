"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@/context/LanguageContext";

const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

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

export default function PaddleCheckoutPage() {
  const { lang, setLang, t } = useTranslation();
  const [status, setStatus] = useState("loading");
  const [messageKey, setMessageKey] = useState("payment.checkoutOpening");
  const [errorMessage, setErrorMessage] = useState("");

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
              displayMode: "overlay",
              theme: "light",
              locale: lang === "ru" ? "ru" : "ro",
              allowLogout: false,
            },
          },
        });

        Paddle.Checkout.open({ transactionId: params.transactionId });
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
  }, [lang, params.lang, params.orderId, params.returnTo, params.transactionId, setLang]);

  const returnHref = normalizeReturnTo(params.returnTo);
  const isError = status === "error";

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

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.1fr_0.9fr]">
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
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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

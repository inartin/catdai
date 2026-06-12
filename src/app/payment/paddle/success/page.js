"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";

const TERMINAL_STATUSES = new Set(["paid", "canceled", "payment_failed", "failed"]);
const PAYMENT_STATUS_KEYS = {
  pending: "payment.orderStatusPending",
  registered: "payment.orderStatusRegistered",
  checkout_closed: "payment.orderStatusCheckoutClosed",
  paid: "payment.orderStatusPaid",
  payment_failed: "payment.orderStatusFailed",
  failed: "payment.orderStatusFailed",
  canceled: "payment.orderStatusCanceled",
};

function getInitialParams() {
  if (typeof window === "undefined") {
    return { orderId: "", transactionId: "", checkout: "", returnTo: "", lang: "" };
  }

  const searchParams = new URLSearchParams(window.location.search);
  return {
    orderId: searchParams.get("order_id") || "",
    transactionId: searchParams.get("transaction_id") || "",
    checkout: searchParams.get("checkout") || "",
    returnTo: searchParams.get("return_to") || "",
    lang: searchParams.get("lang") || "",
  };
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

function getDisplayState({ loading, error, order, checkout }) {
  if (loading && !order) {
    return {
      tone: "neutral",
      titleKey: "payment.statusCheckingTitle",
      messageKey: "payment.statusCheckingMessage",
    };
  }

  if (error) {
    return {
      tone: "error",
      titleKey: "payment.statusUnavailableTitle",
      message: error,
    };
  }

  if (order?.status === "paid") {
    return {
      tone: "success",
      titleKey: "payment.statusPaidTitle",
      messageKey: "payment.statusPaidMessage",
    };
  }

  if (order?.status === "payment_failed" || order?.status === "failed") {
    return {
      tone: "error",
      titleKey: "payment.statusFailedTitle",
      messageKey: "payment.statusFailedMessage",
    };
  }

  if (order?.status === "canceled") {
    return {
      tone: "error",
      titleKey: "payment.statusCanceledTitle",
      messageKey: "payment.statusFailedMessage",
    };
  }

  if (order?.status === "checkout_closed" || checkout === "closed") {
    return {
      tone: "neutral",
      titleKey: "payment.statusClosedTitle",
      messageKey: "payment.statusClosedMessage",
    };
  }

  if (checkout === "completed") {
    return {
      tone: "neutral",
      titleKey: "payment.statusCompletedTitle",
      messageKey: "payment.statusCompletedMessage",
    };
  }

  return {
    tone: "neutral",
    titleKey: "payment.statusCheckingTitle",
    messageKey: "payment.statusCheckingMessage",
  };
}

export default function PaddlePaymentSuccessPage() {
  const { lang, setLang, t } = useTranslation();
  const { session, isAuthenticated, loading: authLoading } = useAuth();
  const params = useMemo(() => getInitialParams(), []);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const immediateError =
    !authLoading && (!isAuthenticated || !session?.access_token)
      ? t("payment.statusLoginRequired")
      : !params.orderId && !params.transactionId
        ? t("payment.statusMissingReference")
        : "";

  useEffect(() => {
    if ((params.lang === "ro" || params.lang === "ru") && params.lang !== lang) {
      setLang(params.lang);
    }
  }, [lang, params.lang, setLang]);

  useEffect(() => {
    if (authLoading || immediateError) return undefined;

    let active = true;
    let timeoutId;
    let closedMarked = false;

    async function markCheckoutClosed() {
      if (closedMarked || params.checkout !== "closed") return;
      closedMarked = true;

      await fetch("/api/payments/paddle/checkout-closed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          order_id: params.orderId,
          transaction_id: params.transactionId,
        }),
      }).catch(() => {});
    }

    async function checkStatus() {
      setLoading(true);

      const searchParams = new URLSearchParams();
      if (params.orderId) searchParams.set("order_id", params.orderId);
      if (params.transactionId) searchParams.set("transaction_id", params.transactionId);

      try {
        await markCheckoutClosed();

        const response = await fetch(`/api/payments/paddle/status?${searchParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const payload = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok) {
          setError(payload?.error || t("payment.statusCheckError"));
          setLoading(false);
          return;
        }

        setOrder(payload);
        setError("");
        setLoading(false);

        if (!TERMINAL_STATUSES.has(payload.status)) {
          timeoutId = window.setTimeout(checkStatus, 3000);
        }
      } catch {
        if (!active) return;
        setError(t("payment.statusCheckError"));
        setLoading(false);
      }
    }

    checkStatus();

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [authLoading, immediateError, params.checkout, params.orderId, params.transactionId, session?.access_token, t]);

  const display = getDisplayState({ loading: loading && !immediateError, error: immediateError || error, order, checkout: params.checkout });
  const accentClass = display.tone === "success" ? "bg-emerald-500" : display.tone === "error" ? "bg-red-500" : "bg-primary";
  const statusPillClass = display.tone === "success" ? "bg-emerald-50 text-emerald-700" : display.tone === "error" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600";
  const returnHref = normalizeReturnTo(params.returnTo);
  const displayMessage = display.message || t(display.messageKey);
  const localizedStatus = order?.status ? t(PAYMENT_STATUS_KEYS[order.status] || "payment.orderStatusUnknown") : "";

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
              {t("payment.statusEyebrow")}
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-normal text-gray-950 sm:text-5xl">
              {t(display.titleKey)}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-gray-600">
              {displayMessage}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className={`mt-1 h-3 w-3 flex-none rounded-full ${accentClass}`} aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-gray-950">{t("payment.statusPanelTitle")}</h2>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  {display.tone === "success" ? t("payment.statusSuccessNextStep") : t("payment.statusDefaultNextStep")}
                </p>
              </div>
            </div>

            {order?.status && (
              <div className="mt-6 border-t border-gray-100 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                  {t("payment.statusLabel")}
                </p>
                <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusPillClass}`}>
                  {localizedStatus}
                </span>
              </div>
            )}

            <Link
              href={returnHref}
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              {t("payment.backToEvaluation")}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

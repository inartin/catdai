"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const TERMINAL_STATUSES = new Set(["paid", "canceled", "payment_failed", "failed"]);

function getInitialParams() {
  if (typeof window === "undefined") {
    return { orderId: "", transactionId: "", checkout: "", returnTo: "" };
  }

  const searchParams = new URLSearchParams(window.location.search);
  return {
    orderId: searchParams.get("order_id") || "",
    transactionId: searchParams.get("transaction_id") || "",
    checkout: searchParams.get("checkout") || "",
    returnTo: searchParams.get("return_to") || "",
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
      title: "Checking payment",
      message: "Waiting for confirmation...",
    };
  }

  if (error) {
    return {
      tone: "error",
      title: "Payment status unavailable",
      message: error,
    };
  }

  if (order?.status === "paid") {
    return {
      tone: "success",
      title: "Payment succeeded",
      message: "Access was granted.",
    };
  }

  if (order?.status === "payment_failed" || order?.status === "failed") {
    return {
      tone: "error",
      title: "Payment failed",
      message: "No access was granted.",
    };
  }

  if (order?.status === "canceled" || checkout === "closed") {
    return {
      tone: "error",
      title: "Payment not completed",
      message: "No access was granted.",
    };
  }

  if (checkout === "completed") {
    return {
      tone: "neutral",
      title: "Payment completed",
      message: "Confirming access...",
    };
  }

  return {
    tone: "neutral",
    title: "Checking payment",
    message: "Waiting for confirmation...",
  };
}

export default function PaddlePaymentSuccessPage() {
  const { session, isAuthenticated, loading: authLoading } = useAuth();
  const params = useMemo(() => getInitialParams(), []);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const immediateError =
    !authLoading && (!isAuthenticated || !session?.access_token)
      ? "Log in to check this payment."
      : !params.orderId && !params.transactionId
        ? "Missing payment reference."
        : "";

  useEffect(() => {
    if (authLoading || immediateError) return undefined;

    let active = true;
    let timeoutId;

    async function checkStatus() {
      setLoading(true);

      const searchParams = new URLSearchParams();
      if (params.orderId) searchParams.set("order_id", params.orderId);
      if (params.transactionId) searchParams.set("transaction_id", params.transactionId);

      try {
        const response = await fetch(`/api/payments/paddle/status?${searchParams.toString()}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const payload = await response.json().catch(() => ({}));
        if (!active) return;

        if (!response.ok) {
          setError(payload?.error || "Could not check payment status.");
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
        setError("Could not check payment status.");
        setLoading(false);
      }
    }

    checkStatus();

    return () => {
      active = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [authLoading, immediateError, params.orderId, params.transactionId, session?.access_token]);

  const display = getDisplayState({ loading: loading && !immediateError, error: immediateError || error, order, checkout: params.checkout });
  const titleClass = display.tone === "success" ? "text-emerald-700" : display.tone === "error" ? "text-red-700" : "text-gray-900";
  const returnHref = normalizeReturnTo(params.returnTo);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className={`text-2xl font-semibold ${titleClass}`}>{display.title}</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{display.message}</p>
          {order?.status && (
            <p className="mt-3 text-sm text-gray-600">
              Status: <span className="font-medium">{order.status}</span>
            </p>
          )}
          <Link
            href={returnHref}
            className="mt-6 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to evaluation
          </Link>
        </div>
      </div>
    </main>
  );
}

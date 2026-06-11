"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

export default function PaddleCheckoutPage() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Loading checkout...");

  const params = useMemo(() => {
    if (typeof window === "undefined") return { transactionId: "", orderId: "" };
    const searchParams = new URLSearchParams(window.location.search);
    return {
      transactionId: searchParams.get("_ptxn") || "",
      orderId: searchParams.get("order_id") || "",
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    let redirected = false;

    function redirectToResult(result, eventTransactionId) {
      if (redirected || typeof window === "undefined") return;
      redirected = true;

      const url = new URL("/payment/paddle/success", window.location.origin);
      if (params.orderId) url.searchParams.set("order_id", params.orderId);
      url.searchParams.set("transaction_id", eventTransactionId || params.transactionId);
      url.searchParams.set("checkout", result);
      window.location.href = url.toString();
    }

    async function openCheckout() {
      if (!params.transactionId) {
        setStatus("error");
        setMessage("Missing Paddle transaction.");
        return;
      }

      const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
      if (!token) {
        setStatus("error");
        setMessage("Missing NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.");
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
              locale: "ro",
              allowLogout: false,
            },
          },
        });

        Paddle.Checkout.open({ transactionId: params.transactionId });
        setStatus("ready");
        setMessage("Checkout opened.");
      } catch (error) {
        if (canceled) return;
        setStatus("error");
        setMessage(error.message || "Checkout failed to open.");
      }
    }

    openCheckout();

    return () => {
      canceled = true;
    };
  }, [params.orderId, params.transactionId]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#D6A641]">
            Catdai
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Paddle checkout</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600">{message}</p>
          {status === "error" && (
            <Link
              href="/payment/paddle/test"
              className="mt-6 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Back to test page
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

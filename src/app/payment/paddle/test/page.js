"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function PaddleTestPaymentPage() {
  const { session, isAuthenticated, loading } = useAuth();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const createPayment = async () => {
    if (!session?.access_token) {
      setStatus("error");
      setMessage("Log in before creating a test payment.");
      return;
    }

    setStatus("loading");
    setMessage("Creating Paddle transaction...");

    try {
      const response = await fetch("/api/payments/paddle/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_key: "cadastru_lookup_single",
          lang: "ro",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${payload?.error || "Paddle payment creation failed."}${details}`);
      }

      const checkoutUrl = payload?.checkout?.url;
      if (!checkoutUrl) {
        throw new Error("Paddle checkout URL was not returned.");
      }

      setStatus("redirecting");
      setMessage("Opening Paddle checkout...");
      window.location.href = checkoutUrl;
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Could not create Paddle payment.");
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Paddle test payment</h1>

          {!loading && !isAuthenticated && (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Log in first, then return to this page.
            </p>
          )}

          {message && (
            <p className={status === "error" ? "mt-4 text-sm text-red-600" : "mt-4 text-sm text-gray-600"}>
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={createPayment}
            disabled={loading || status === "loading" || status === "redirecting" || !isAuthenticated}
            className="mt-6 inline-flex w-full justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {status === "loading" || status === "redirecting" ? "Please wait..." : "Create Paddle test payment"}
          </button>
        </div>
      </div>
    </main>
  );
}

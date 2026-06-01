"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import CadastralDataCard from "@/components/CadastralDataCard";
import { useTranslation } from "@/context/LanguageContext";

function CadastruResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const cadastralNumber = searchParams.get("cadastral_number") || "";
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  useEffect(() => {
    document.title = `${t("cadastru.resultPageTitle")} | Catdai`;
  }, [t]);

  useEffect(() => {
    if (!cadastralNumber) {
      return;
    }

    let active = true;

    async function loadCadastralData() {
      setState({ loading: true, error: "", data: null });

      try {
        const response = await fetch("/api/cadastral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cadastral_number: cadastralNumber }),
        });

        if (!response.ok) {
          if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null });
          return;
        }

        const data = await response.json();
        if (active) setState({ loading: false, error: "", data });
      } catch {
        if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null });
      }
    }

    loadCadastralData();

    return () => {
      active = false;
    };
  }, [cadastralNumber, t]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <BackButton onClick={() => router.push("/cadastru")} className="mb-6">
            {t("cadastru.backToSearch")}
          </BackButton>

          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {t("cadastru.resultPageTitle")}
            </h1>
          </div>

          {state.loading && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600 shadow-sm sm:p-8">
              {t("cadastru.searching")}
            </div>
          )}

          {(state.error || (!cadastralNumber && !state.loading)) && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm font-medium text-red-800 shadow-sm sm:p-8">
              {state.error || t("cadastru.lookupError")}
            </div>
          )}

          {state.data && <CadastralDataCard cadastral={state.data} />}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default function CadastruResultPage() {
  return (
    <Suspense>
      <CadastruResultContent />
    </Suspense>
  );
}

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import CadastralDataCard from "@/components/CadastralDataCard";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

function CadastruResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t } = useTranslation();
  const { session, isAuthenticated, loading: authLoading, clearAuthError } = useAuth();
  const cadastralNumber = searchParams.get("cadastral_number") || "";
  const source = searchParams.get("source") || "";
  const loadedRequestKey = useRef("");
  const [authModalDismissed, setAuthModalDismissed] = useState(false);
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });
  const authRequired = !authLoading && Boolean(cadastralNumber) && !isAuthenticated;

  useEffect(() => {
    if (authLoading) return;
    if (!cadastralNumber) {
      return;
    }

    if (!isAuthenticated) return;

    const requestKey = `${cadastralNumber}|${source === "number" ? "number" : ""}`;
    if (loadedRequestKey.current === requestKey) return;

    let active = true;

    async function loadCadastralData() {
      setState({ loading: true, error: "", data: null });

      try {
        const body = { cadastral_number: cadastralNumber };
        if (source === "number") body.search_context = "cadastru";

        const response = await fetch("/api/cadastral", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          if (response.status === 401) {
            clearAuthError();
            if (active) setState({ loading: false, error: t("cadastru.loginToUse"), data: null });
            return;
          }
          if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null });
          return;
        }

        const data = await response.json();
        if (active) {
          loadedRequestKey.current = requestKey;
          setState({ loading: false, error: "", data });
        }
      } catch {
        if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null });
      }
    }

    loadCadastralData();

    return () => {
      active = false;
    };
  }, [authLoading, cadastralNumber, clearAuthError, isAuthenticated, session?.access_token, source, t]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AuthRequiredModal
        open={authRequired && !authModalDismissed}
        copyKey="cadastru.loginToUse"
        onClose={() => setAuthModalDismissed(true)}
      />
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <BackButton onClick={() => router.push(`/${lang}/cadastru`)} className="mb-6">
            {t("cadastru.backToSearch")}
          </BackButton>

          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {t("cadastru.resultPageTitle")}
            </h1>
          </div>

          {state.loading && !authRequired && (
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

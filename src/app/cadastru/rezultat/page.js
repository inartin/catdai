"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import CadastralDataCard from "@/components/CadastralDataCard";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import FeaturePricingAction from "@/components/FeaturePricingAction";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

const inFlightCadastralLookups = new Map();
const CADASTRU_DRAFT_STORAGE_KEY = "catdai:cadastru-search-draft:v1";

function fetchCadastralLookup(cacheKey, body, accessToken) {
  const existing = inFlightCadastralLookups.get(cacheKey);
  if (existing) return existing;

  const promise = fetch("/api/cadastral", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  }).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null),
  }));

  inFlightCadastralLookups.set(cacheKey, promise);
  promise.then(
    () => inFlightCadastralLookups.delete(cacheKey),
    () => inFlightCadastralLookups.delete(cacheKey)
  );
  return promise;
}

function CadastruResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, t } = useTranslation();
  const { session, isAuthenticated, loading: authLoading, clearAuthError } = useAuth();
  const cadastralNumber = searchParams.get("cadastral_number") || "";
  const source = searchParams.get("source") || "";
  const limitDailySearches = searchParams.get("limited") === "1";
  const loadedRequestKey = useRef("");
  const [authModalDismissed, setAuthModalDismissed] = useState(false);
  const [limitModalDismissed, setLimitModalDismissed] = useState(false);
  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
    dailyLimitReached: false,
  });
  const authRequired = !authLoading && Boolean(cadastralNumber) && !isAuthenticated;
  const isLockedPreview = state.data?.locked_sections?.cadastru_details === true;
  const purchaseOffer = state.data?.access_limit?.purchase || null;

  useEffect(() => {
    if (!cadastralNumber) return;
    try {
      localStorage.removeItem(CADASTRU_DRAFT_STORAGE_KEY);
    } catch {
      // Draft cleanup is best-effort after the result page opens.
    }
  }, [cadastralNumber]);

  useEffect(() => {
    if (authLoading) return;
    if (!cadastralNumber) {
      return;
    }

    if (!isAuthenticated) return;

    const searchSource = source === "address" || source === "number" ? source : "";
    const requestKey = `${cadastralNumber}|${searchSource}`;
    if (loadedRequestKey.current === requestKey) return;
    if (!session?.access_token) return;

    let active = true;

    async function loadCadastralData() {
      setState({ loading: true, error: "", data: null, dailyLimitReached: false });

      try {
        const body = { cadastral_number: cadastralNumber };
        if (searchSource === "number" && limitDailySearches) {
          body.search_context = "cadastru";
          body.search_type = searchSource;
        }

        const response = await fetchCadastralLookup(`${requestKey}|${session.access_token}`, body, session.access_token);

        if (!response.ok) {
          if (response.status === 401) {
            clearAuthError();
            if (active) setState({ loading: false, error: t("cadastru.loginToUse"), data: null, dailyLimitReached: false });
            return;
          }
          if (response.status === 429 && response.data?.error === "daily_limit_reached") {
            if (active) {
              setLimitModalDismissed(false);
              setState({ loading: false, error: "", data: null, dailyLimitReached: true });
            }
            return;
          }
          if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null, dailyLimitReached: false });
          return;
        }

        if (active) {
          loadedRequestKey.current = requestKey;
          setState({ loading: false, error: "", data: response.data, dailyLimitReached: false });
        }
      } catch {
        if (active) setState({ loading: false, error: t("cadastru.lookupError"), data: null, dailyLimitReached: false });
      }
    }

    loadCadastralData();

    return () => {
      active = false;
    };
  }, [authLoading, cadastralNumber, clearAuthError, isAuthenticated, limitDailySearches, session?.access_token, source, t]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AuthRequiredModal
        open={authRequired && !authModalDismissed}
        copyKey="cadastru.loginToUse"
        onClose={() => setAuthModalDismissed(true)}
      />
      <AuthRequiredModal
        open={state.dailyLimitReached && !limitModalDismissed}
        copyKey="cadastru.dailyLimitReached"
        showAuthOptions={false}
        onClose={() => setLimitModalDismissed(true)}
      />
      <AuthRequiredModal
        open={isPaywallModalOpen}
        copyKey="payment.buyAccess"
        showAuthOptions={false}
        onClose={() => setIsPaywallModalOpen(false)}
      >
        {purchaseOffer ? (
          <>
            <p className="mb-4 text-center text-sm font-medium text-gray-500">
              {t("payment.limitPackageSubtitle")}
            </p>
            <FeaturePricingAction offer={purchaseOffer} />
          </>
        ) : null}
      </AuthRequiredModal>
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

          {state.data && (
            <CadastralDataCard
              cadastral={state.data}
              locked={isLockedPreview}
              onLockedClick={isLockedPreview ? () => setIsPaywallModalOpen(true) : undefined}
            />
          )}
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

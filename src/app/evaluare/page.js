"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EstimateResult from "@/components/EstimateResult";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { getDeviceId, getSessionId, computeEvaluationGroupId, getOrCreateLogId } from "@/lib/tracking";

function EvaluareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const paramsString = searchParams.toString();

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams(paramsString);
      const city = params.get("city");
      const district = params.get("district");
      const rooms = params.get("rooms");
      const area = params.get("area");
      const cadastralNumber = params.get("cadastral_number");

      if (!city || !district || !rooms || !area) {
        router.replace("/");
        return;
      }

      const roomsVal = rooms === "5+" ? 5 : parseInt(rooms, 10);

      const bathroomsRaw = params.get("bathrooms");
      const balconiesRaw = params.get("balconies");
      const bathroomsVal =
        bathroomsRaw === "3+" ? 3 : bathroomsRaw ? parseInt(bathroomsRaw, 10) : null;
      const balconiesVal =
        balconiesRaw === "3+" ? 3 : balconiesRaw != null ? parseInt(balconiesRaw, 10) : null;

      const isFreshEvaluation = params.get("_new") === "1";

      if (isFreshEvaluation) {
        const clean = new URLSearchParams(paramsString);
        clean.delete("_new");
        window.history.replaceState(null, "", `/evaluare?${clean.toString()}`);
      }

      const trackingData = isFreshEvaluation
        ? (() => {
            const evalGroupId = computeEvaluationGroupId({
              city,
              district,
              rooms_count: roomsVal,
              building_type: params.get("building_type") || null,
            });
            return {
              log_id: getOrCreateLogId(evalGroupId),
              device_id: getDeviceId(),
              session_id: getSessionId(),
              evaluation_group_id: evalGroupId,
              language: lang,
            };
          })()
        : {};

      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const fetchJson = async (url, options) => {
        const res = await fetch(url, options);
        let data = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        return { ok: res.ok, status: res.status, data };
      };

      try {
        const estimatePromise = fetchJson("/api/estimate", {
          method: "POST",
          headers,
          body: JSON.stringify({
            city,
            district,
            rooms_count: roomsVal,
            area_m2: area,
            floor: params.get("floor") || null,
            total_floors: params.get("total_floors") || null,
            building_type: params.get("building_type") || null,
            renovation: params.get("renovation") || null,
            bathrooms_count: bathroomsVal,
            balconies_count: balconiesVal,
            ...trackingData,
          }),
        });

        const cadastralPromise = cadastralNumber
          ? fetchJson("/api/cadastral", {
              method: "POST",
              headers,
              body: JSON.stringify({
                cadastral_number: cadastralNumber,
              }),
            })
          : Promise.resolve(null);

        const [estimateResponse, cadastralResponse] = await Promise.all([
          estimatePromise,
          cadastralPromise,
        ]);

        if (cancelled) return;

        if (!estimateResponse.ok) {
          setError({
            code: estimateResponse.data.error || "unknown",
            status: estimateResponse.status,
          });
          return;
        }

        const nextResult =
          cadastralResponse && cadastralResponse.ok
            ? { ...estimateResponse.data, cadastral: cadastralResponse.data }
            : estimateResponse.data;

        setResult(nextResult);
      } catch {
        if (!cancelled) {
          setError({ code: "connection", message: t("evaluare.connectionError") });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token, paramsString, router, lang, t]);

  const handleEdit = () => {
    const editParams = new URLSearchParams();
    ["city", "district", "rooms", "area", "floor", "total_floors", "building_type", "renovation", "bathrooms", "balconies", "cadastral_number"].forEach((key) => {
      const val = searchParams.get(key);
      if (val) editParams.set(key, val);
    });
    router.push(`/?${editParams.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <svg
          className="w-10 h-10 animate-spin text-primary"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            className="opacity-25"
          />
          <path
            d="M4 12a8 8 0 018-8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <p className="text-sm text-gray-500">{t("evaluare.loading")}</p>
      </div>
    );
  }

  if (error) {
    const isInsufficientData = error.code === "insufficient_data";
    const isRateLimit = error.status === 429;
    const displayMessage = isRateLimit
      ? t("evaluare.rateLimitError")
      : error.code === "connection"
        ? t("evaluare.connectionError")
        : t("evaluare.defaultError");

    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        {isInsufficientData ? (
          <div className="p-6 rounded-2xl bg-amber-50 border border-amber-200 mb-6 text-left">
            <div className="flex items-start gap-3">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p className="text-base font-semibold text-amber-800 mb-1">
                  {t("evaluare.insufficientDataTitle")}
                </p>
                <p className="text-sm text-amber-700 mb-3">
                  {t("evaluare.insufficientDataDesc")}
                </p>
                <ul className="text-sm text-amber-700 space-y-1.5 list-disc list-inside">
                  <li>{t("evaluare.suggestionDistrict")}</li>
                  <li>{t("evaluare.suggestionFilters")}</li>
                  <li>{t("evaluare.suggestionArea")}</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 mb-6">
            {displayMessage}
          </div>
        )}
        <button
          type="button"
          onClick={handleEdit}
          className="inline-flex items-center gap-2 py-3 px-6 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {isInsufficientData ? t("evaluare.editCriteria") : t("evaluare.tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      {result && (
        <EstimateResult data={result} onReset={handleEdit} />
      )}
    </div>
  );
}

export default function EvaluarePage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <Suspense>
          <EvaluareContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

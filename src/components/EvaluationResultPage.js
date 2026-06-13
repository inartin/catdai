"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EstimateResult from "@/components/EstimateResult";
import LinkAnalyzer from "@/components/LinkAnalyzer";
import PropertyForm from "@/components/PropertyForm";
import CadastruSearchForm from "@/components/CadastruSearchForm";
import CadastruSourceNote from "@/components/CadastruSourceNote";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import {
  computeEvaluationGroupId,
  getActiveAdSource,
  getDeviceId,
  getOrCreateLogId,
  getSessionId,
  trackAdSourceEvent,
} from "@/lib/tracking";
import { validateEstimateInput, validateCadastralNumber } from "@/lib/validation";

function isTrueParam(value) {
  return value === "1" || value === "true";
}

function buildListingComparison(params) {
  const price = Number(params.get("listing_price"));
  if (!Number.isFinite(price) || price <= 0) return null;
  return {
    asking_price: price,
    currency: params.get("listing_currency") || "EUR",
    external_id: params.get("listing_id") || null,
    address_text: params.get("listing_address") || null,
  };
}

function ensurePrimaryEstimateType(params) {
  if (!params.has("type") && params.get("mode") === "rent") {
    params.set("type", "rent");
  }
  return params;
}

function buildResultUrl(routePath, params) {
  ensurePrimaryEstimateType(params);
  const query = params.toString();
  const path = routePath || "/evaluare";
  return query ? `${path}?${query}` : path;
}

function replaceEvaluationUrl(router, params, routePath, options) {
  router.replace(buildResultUrl(routePath, params), options);
}

function EvaluareContent({ routePath = "/evaluare", pageTitleKey = "evaluare.pageTitle" }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isComparing, setIsComparing] = useState(false);
  const [isListingsMode, setIsListingsMode] = useState(false);
  const [result2, setResult2] = useState(null);
  const [error2, setError2] = useState(null);
  const [loading2, setLoading2] = useState(false);

  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const paramsString = searchParams.toString();
  const isListingAnalysisPage = routePath === "/anunt";
  const showCadastruSearch = !isListingAnalysisPage && !paramsString;

  useEffect(() => {
    document.title = `${t(pageTitleKey)} | Catdai`;
  }, [pageTitleKey, t]);

  // Capture share_slug once on first render so it survives URL stripping
  const shareSlugRef = useRef(searchParams.get("share_slug"));
  const loadedPrimaryParamsRef = useRef(null);
  const loadedCompareParamsRef = useRef(null);
  const previewImageRequestsRef = useRef(new Set());

  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;

    const run = async () => {
      const pRaw = new URLSearchParams(paramsString);
      const isFreshEvaluation = pRaw.get("_new") === "1";
      const shareSlug = shareSlugRef.current;

      if (isFreshEvaluation || shareSlug) {
        const clean = new URLSearchParams(paramsString);
        clean.delete("_new");
        clean.delete("share_slug");
        ensurePrimaryEstimateType(clean);
        window.history.replaceState(null, "", buildResultUrl(routePath, clean));
      }

      const p1Params = new URLSearchParams();
      const p2Params = new URLSearchParams();
      pRaw.forEach((val, key) => {
        if (key === "_new" || key === "share_slug") return;
        if (key.startsWith("c_")) p2Params.set(key, val);
        else p1Params.set(key, val);
      });
      p1Params.sort();
      p2Params.sort();
      const primaryStr = p1Params.toString();
      const compareStr = p2Params.toString();

      const hasCompare = !!pRaw.get("c_city");
      const needsPrimaryFetch = primaryStr && primaryStr !== loadedPrimaryParamsRef.current;
      const needsCompareFetch = hasCompare && compareStr !== loadedCompareParamsRef.current;

      if (!primaryStr && !hasCompare) {
        setResult(null);
        setError(null);
        setLoading(false);
        loadedPrimaryParamsRef.current = null;
        loadedCompareParamsRef.current = null;
        return;
      }

      if (!needsPrimaryFetch && !needsCompareFetch) {
        if (!hasCompare && loadedCompareParamsRef.current !== null) {
          setResult2(null);
          loadedCompareParamsRef.current = null;
        }
        return;
      }

      if (needsPrimaryFetch) {
        setLoading(true);
        setError(null);
      }
      if (needsCompareFetch) {
        setLoading2(true);
        setError2(null);
      }

      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const fetchJson = async (url, options) => {
        const res = await fetch(url, options);
        let data = {};
        try { data = await res.json(); } catch { data = {}; }
        return { ok: res.ok, status: res.status, data };
      };

      const snapshotId = pRaw.get("snapshot_id");
      if (snapshotId) {
        if (!session?.access_token) {
          setError({ code: "snapshot_auth", status: 401 });
          setLoading(false);
          return;
        }

        try {
          const snapshotRes = await fetchJson(
            `/api/profile/evaluation-snapshots/${encodeURIComponent(snapshotId)}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } }
          );
          if (cancelled) return;

          if (!snapshotRes.ok || !snapshotRes.data?.snapshot?.result) {
            setError({ code: snapshotRes.data?.error || "snapshot_unavailable", status: snapshotRes.status });
            loadedPrimaryParamsRef.current = null;
          } else {
            setResult(snapshotRes.data.snapshot.result);
            setResult2(null);
            setError(null);
            setError2(null);
            setIsComparing(false);
            loadedPrimaryParamsRef.current = primaryStr;
            loadedCompareParamsRef.current = null;
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      const fetchProperty = async (pFx, isPrimary) => {
        const estimateType = pRaw.get(pFx + "type") || pRaw.get(pFx + "mode");
        const isRentMode = estimateType === "rent";
        const city = pRaw.get(pFx + "city");
        const districts = pRaw.getAll(pFx + "district").filter(Boolean);
        const district = districts[0] || pRaw.get(pFx + "district");
        const buildingTypes = pRaw.getAll(pFx + "building_type").filter(Boolean);
        const buildingType = buildingTypes[0] || pRaw.get(pFx + "building_type");
        const rooms = pRaw.get(pFx + "rooms");
        const area = pRaw.get(pFx + "area");
        if (!city || !rooms) return null;

        const roomsVal = rooms === "5+" ? 5 : parseInt(rooms, 10);
        const bRaw = pRaw.get(pFx + "bathrooms");
        const balRaw = pRaw.get(pFx + "balconies");
        const bVal = bRaw === "3+" ? 3 : bRaw ? parseInt(bRaw, 10) : null;
        const balVal = balRaw === "3+" ? 3 : balRaw != null ? parseInt(balRaw, 10) : null;
        const firstFloor = isTrueParam(pRaw.get(pFx + "first_floor"));
        const lastFloor = isTrueParam(pRaw.get(pFx + "last_floor"));

        const validation = validateEstimateInput({
          city, district, rooms_count: roomsVal, area_m2: area,
          floor: pRaw.get(pFx + "floor") || null,
          first_floor: firstFloor,
          last_floor: lastFloor,
          total_floors: pRaw.get(pFx + "total_floors") || null,
          building_type: buildingType || null,
          renovation: pRaw.get(pFx + "renovation") || null,
          bathrooms_count: bVal, balconies_count: balVal,
        });

        if (!validation.valid) {
          return { error: { code: validation.reason, field: validation.field } };
        }

        const v = validation.data;

        const cNum = pRaw.get(pFx + "cadastral_number");
        if (cNum) {
          const cadVal = validateCadastralNumber(cNum);
          if (!cadVal.valid) {
            return { error: { code: "invalid_cadastral", field: "cadastral_number" } };
          }
        }

        const trackingData = (isPrimary && isFreshEvaluation) ? (() => {
          const evalGroupId = computeEvaluationGroupId({
            city: v.city, district: v.district, rooms_count: v.rooms_count, building_type: v.building_type || null,
            estimate_type: isRentMode ? "rent" : null,
          });
          const attribution = getActiveAdSource();
          return {
            log_id: getOrCreateLogId(evalGroupId),
            device_id: getDeviceId(),
            session_id: getSessionId(),
            evaluation_group_id: evalGroupId,
            language: lang,
            ad_source: attribution?.source || null,
          };
        })() : {};

        const estimateUrl = isRentMode ? "/api/estimate-rent" : "/api/estimate";
        const estimateBody = isRentMode
          ? {
            city: v.city,
            districts: districts.length > 0 ? districts : [v.district].filter(Boolean),
            rooms_count: v.rooms_count,
            area_m2: v.area_m2,
            floor: v.floor ?? null,
            building_types: buildingTypes,
            renovation: v.renovation ?? null,
            bathrooms_count: v.bathrooms_count ?? null,
            ...trackingData,
          }
          : {
            city: v.city, district: v.district, rooms_count: v.rooms_count, area_m2: v.area_m2,
            floor: v.floor ?? null,
            first_floor: v.first_floor ?? false,
            last_floor: v.last_floor ?? false,
            total_floors: v.total_floors ?? null,
            building_type: v.building_type ?? null,
            renovation: v.renovation ?? null,
            bathrooms_count: v.bathrooms_count ?? null,
            balconies_count: v.balconies_count ?? null,
            ...(isPrimary && shareSlug ? { share_slug: shareSlug } : {}),
            ...trackingData,
          };

        const estReq = fetchJson(estimateUrl, {
          method: "POST", headers,
          body: JSON.stringify(estimateBody),
        });

        const cadReq = !isRentMode && cNum ? fetchJson("/api/cadastral", { method: "POST", headers, body: JSON.stringify({ cadastral_number: cNum }) }) : Promise.resolve(null);

        const [estRes, cadRes] = await Promise.all([estReq, cadReq]);
        if (!estRes.ok) return { error: { code: estRes.data.error || "unknown", status: estRes.status } };
        const data = {
          ...estRes.data,
          ...(isRentMode ? { estimate_type: "rent" } : {}),
          ...(cadRes && cadRes.ok ? { cadastral: cadRes.data } : {}),
          tracking: {
            estimate_log_id: trackingData.log_id || null,
          },
        };
        if (isPrimary && isFreshEvaluation) {
          trackAdSourceEvent("estimate_result_view", {
            accessToken: session?.access_token || null,
            log_id: trackingData.log_id || null,
            city: v.city,
            district: v.district,
            rooms_count: v.rooms_count,
          });
        }
        return { data };
      };

      try {
        if (needsPrimaryFetch) {
          const res1 = await fetchProperty("", true);
          if (cancelled) return;
          if (!res1) {
            router.replace("/");
            return;
          }
          if (res1.error) {
            setError(res1.error);
            loadedPrimaryParamsRef.current = null;
          } else {
            let listingComparison = buildListingComparison(pRaw);
            let listingDuplicates = null;
            if (listingComparison?.external_id) {
              const [historyRes, duplicateRes] = await Promise.all([
                fetchJson(`/api/listing-price-history?external_id=${encodeURIComponent(listingComparison.external_id)}`),
                fetchJson("/api/listing-duplicates", {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    listing_type: "sale",
                    external_id: listingComparison.external_id,
                    listing_price: listingComparison.asking_price,
                    listing_currency: listingComparison.currency,
                    listing_address: listingComparison.address_text,
                    params: {
                      city: res1.data?.input?.city,
                      district: res1.data?.input?.district,
                      rooms_count: res1.data?.input?.rooms_count,
                      area_m2: res1.data?.input?.area_m2,
                      floor: res1.data?.input?.floor,
                      total_floors: res1.data?.input?.total_floors,
                      building_type: res1.data?.input?.building_type,
                      renovation: res1.data?.input?.renovation,
                      bathrooms_count: res1.data?.input?.bathrooms_count,
                      balconies_count: res1.data?.input?.balconies_count,
                    },
                  }),
                }),
              ]);
              if (cancelled) return;
              listingComparison = {
                ...listingComparison,
                price_history: historyRes.ok ? (historyRes.data.price_history || []) : [],
              };
              listingDuplicates = duplicateRes.ok ? duplicateRes.data : null;
            }
            setResult(listingComparison ? {
              ...res1.data,
              listing_comparison: listingComparison,
              ...(listingDuplicates ? { listing_duplicates: listingDuplicates } : {}),
            } : res1.data);
            loadedPrimaryParamsRef.current = primaryStr;
          }
        }

        if (hasCompare) {
          setIsComparing(true);
          if (needsCompareFetch) {
            const res2 = await fetchProperty("c_", false);
            if (cancelled) return;
            if (res2) {
              if (res2.error) {
                setError2(res2.error);
                loadedCompareParamsRef.current = null;
              } else {
                setResult2(res2.data);
                loadedCompareParamsRef.current = compareStr;
              }
            }
          }
        } else {
          setResult2(null);
          loadedCompareParamsRef.current = null;
        }
      } catch {
        if (!cancelled) setError({ code: "connection", message: t("evaluare.connectionError") });
      } finally {
        if (!cancelled) {
          if (needsPrimaryFetch) setLoading(false);
          if (needsCompareFetch) setLoading2(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token, paramsString, router, routePath, lang, t]);

  useEffect(() => {
    const hydrateListingImages = async (data, updateResult, slot) => {
      const listings = Array.isArray(data?.relevant_listings) ? data.relevant_listings : [];
      const externalIds = listings
        .filter((listing) => listing?.external_id && !listing.image_url)
        .map((listing) => String(listing.external_id))
        .filter((externalId) => !previewImageRequestsRef.current.has(`${slot}:${lang}:${externalId}`));
      const uniqueIds = [...new Set(externalIds)];
      if (uniqueIds.length === 0) return;

      uniqueIds.forEach((externalId) => {
        previewImageRequestsRef.current.add(`${slot}:${lang}:${externalId}`);
      });

      try {
        const res = await fetch("/api/listing-preview-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            external_ids: uniqueIds,
            language: lang,
          }),
        });
        if (!res.ok) return;

        const payload = await res.json();
        const images = payload?.images || {};
        if (Object.keys(images).length === 0) return;

        updateResult((current) => {
          if (!current?.relevant_listings) return current;

          return {
            ...current,
            relevant_listings: current.relevant_listings.map((listing) => {
              const imageUrl = images[String(listing.external_id)];
              return imageUrl ? { ...listing, image_url: imageUrl } : listing;
            }),
          };
        });
      } catch {
        // Listing preview images are optional; the estimate stays usable without them.
      }
    };

    const hydrateComparisonImage = async (data, updateResult, slot) => {
      const comparison = data?.listing_comparison;
      const externalId = comparison?.external_id ? String(comparison.external_id) : null;
      if (!externalId || comparison.image_url) return;
      const requestKey = `${slot}:comparison:${lang}:${externalId}`;
      if (previewImageRequestsRef.current.has(requestKey)) return;
      previewImageRequestsRef.current.add(requestKey);

      try {
        const res = await fetch("/api/listing-preview-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            external_ids: [externalId],
            language: lang,
          }),
        });
        if (!res.ok) return;

        const payload = await res.json();
        const imageUrl = payload?.images?.[externalId];
        if (!imageUrl) return;

        updateResult((current) => {
          if (!current?.listing_comparison) return current;
          return {
            ...current,
            listing_comparison: { ...current.listing_comparison, image_url: imageUrl },
          };
        });
      } catch {
        // Listing preview images are optional; the comparison stays usable without them.
      }
    };

    if (result) {
      hydrateListingImages(result, setResult, "primary");
      hydrateComparisonImage(result, setResult, "primary");
    }
    if (result2) {
      hydrateListingImages(result2, setResult2, "compare");
      hydrateComparisonImage(result2, setResult2, "compare");
    }
  }, [result, result2, lang]);

  if (showCadastruSearch) {
    return (
      <section className="mx-auto w-full max-w-4xl px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
            {t("cadastru.pageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-base text-gray-600">
            {t("cadastru.subtitle")}
          </p>
        </div>

        <CadastruSearchForm
          quickSearchPlacement="top"
          showLocationHeader
        />
        <CadastruSourceNote />
      </section>
    );
  }

  const handleEdit = () => {
    setIsListingsMode(false);
    const editParams = new URLSearchParams();
    ["type", "city", "district", "rooms", "area", "floor", "first_floor", "last_floor", "total_floors", "building_type", "renovation", "bathrooms", "balconies", "cadastral_number"].forEach((key) => {
      const vals = searchParams.getAll(key);
      vals.forEach((val) => {
        if (val) editParams.append(key, val);
      });
    });
    if (!editParams.has("type") && searchParams.get("mode") === "rent") {
      editParams.set("type", "rent");
    }
    router.push(`/estimeaza?${editParams.toString()}`);
  };

  const handleNewEstimate = () => {
    router.push("/estimeaza");
  };

  const startCompare = () => {
    setIsListingsMode(false);
    setIsComparing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCompareSubmit = (newParams) => {
    setLoading2(true);
    const merged = new URLSearchParams(searchParams.toString());
    newParams.forEach((value, key) => {
      if (key !== "_new") merged.set(`c_${key}`, value);
    });
    replaceEvaluationUrl(router, merged, routePath);
  };

  const handleCloseRight = () => {
    setResult2(null);
    setIsComparing(false);
    loadedCompareParamsRef.current = null;
    const clean = new URLSearchParams(searchParams.toString());
    Array.from(clean.keys()).forEach(k => {
      if (k.startsWith("c_")) clean.delete(k);
    });
    replaceEvaluationUrl(router, clean, routePath, { scroll: false });
  };

  const handleCloseLeft = () => {
    if (!result2) {
      setIsComparing(false);
      router.replace("/", { scroll: false });
      return;
    }
    
    // Move result2 to primary perfectly, so component doesn't blink
    setResult(result2);
    setResult2(null);
    setIsComparing(false);

    const newParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key.startsWith("c_")) {
        newParams.set(key.substring(2), value);
      }
    });
    
    // Alias cache to skip re-fetching
    newParams.sort();
    loadedPrimaryParamsRef.current = newParams.toString();
    loadedCompareParamsRef.current = null;

    replaceEvaluationUrl(router, newParams, routePath, { scroll: false });
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
    <div className={`mx-auto py-10 px-4 transition-all duration-300 ${isComparing ? "max-w-[90rem]" : isListingsMode ? "max-w-5xl" : "max-w-6xl"}`}>
      <div className={`flex flex-col ${isComparing ? "md:flex-row items-start justify-center gap-6" : ""}`}>
        {/* Left Side: Primary */}
        <div className={`w-full ${isComparing ? "md:w-1/2 max-w-2xl" : ""}`}>
          {result && (
            <EstimateResult 
              data={result} 
              onReset={handleEdit} 
              onCompare={startCompare} 
              onClose={isComparing ? handleCloseLeft : undefined}
              onListingsModeChange={setIsListingsMode}
              compactLayout={isComparing}
            />
          )}
        </div>

        {/* Middle Divider & vs Icon */}
        {isComparing && (
          <div className="hidden md:flex flex-col items-center w-0 z-10 relative self-stretch border-none pt-[3.5rem]">
            {/* The line */}
            <div className="absolute inset-y-0 w-[2px] bg-primary opacity-70" />

            {/* The icon, if result2 is loaded */}
            {result2 && (
              <div className="relative shrink-0 w-12 h-12 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-primary">
                <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5" />
                  <path d="M8 3H3v5" />
                  <path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3" />
                  <path d="m15 9 6-6" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Right Side: Secondary form or result */}
        {isComparing && (
          <div className={`w-full md:w-1/2 max-w-2xl ${result2 ? "" : "bg-white rounded-2xl border border-gray-100 shadow-sm"}`}>
            {loading2 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <svg className="w-10 h-10 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <p className="text-sm text-gray-500">{t("evaluare.loading")}</p>
              </div>
            ) : result2 ? (
              <EstimateResult
                data={result2}
                onReset={() => {
                  setResult2(null);
                  const clean = new URLSearchParams(searchParams.toString());
                  Array.from(clean.keys()).forEach(k => {
                    if (k.startsWith("c_")) clean.delete(k);
                  });
                  replaceEvaluationUrl(router, clean, routePath);
                }}
                onClose={handleCloseRight}
                compactLayout
              />
            ) : error2 ? (
              <div className="p-6 text-center">
                <div className="p-5 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 mb-6">
                  {error2.code === "connection" ? t("evaluare.connectionError") : t("evaluare.defaultError")}
                </div>
                <button type="button" onClick={() => setResult2(null)} className="py-3 px-6 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  {t("evaluare.tryAgain")}
                </button>
              </div>
            ) : (
              <PropertyForm
                onBack={() => setIsComparing(false)}
                onSubmit={handleCompareSubmit}
              />
            )}
          </div>
        )}
      </div>
      {!isListingsMode && (
        isListingAnalysisPage ? (
          <div className="mx-auto max-w-3xl">
            <LinkAnalyzer titleTag="h2" className="mt-8" />
          </div>
        ) : (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleNewEstimate}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
              {t("evaluare.newEstimate")}
            </button>
          </div>
        )
      )}
    </div>
  );
}

export default function EvaluationResultPage({ routePath = "/evaluare", pageTitleKey = "evaluare.pageTitle" }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <Suspense>
          <EvaluareContent routePath={routePath} pageTitleKey={pageTitleKey} />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import CadastralQuickSearchCard from "@/components/CadastralQuickSearchCard";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { validateCadastralNumber } from "@/lib/validation";
import { CADASTRU_SUPPORTED_CITIES } from "@/lib/cadastru-supported-cities";

const roadTypes = [
  { value: "strada", label: "cadastru.roadTypeStreet" },
  { value: "bulevard", label: "cadastru.roadTypeBoulevard" },
];
const STREET_MAX_LENGTH = 80;
const HOUSE_NUMBER_MAX_LENGTH = 10;
const APARTMENT_NUMBER_MAX_LENGTH = 4;
const HOUSE_NUMBER_PATTERN = /^\d{1,4}(?:\/\d{1,4})?$/;
const APARTMENT_NUMBER_PATTERN = /^\d{1,4}$/;
const MAX_APARTMENT_NUMBER = 9999;
const DRAFT_STORAGE_KEY = "catdai:cadastru-search-draft:v1";
const ADDRESS_PREVIEW_STORAGE_KEY = "catdai:cadastru-address-result-preview:v1";
const ADDRESS_LOOKUP_REQUEST_STORAGE_KEY = "catdai:cadastru-address-lookup-request:v1";

function readSavedDraft() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSavedDraft(draft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is best-effort for auth redirects.
  }
}

function writeAddressResultPreview(preview) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADDRESS_PREVIEW_STORAGE_KEY, JSON.stringify(preview));
  } catch {
    // Preview persistence is best-effort for the result route handoff.
  }
}

function clearAddressResultPreview() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADDRESS_PREVIEW_STORAGE_KEY);
  } catch {
    // Preview cleanup is best-effort.
  }
}

function writeAddressLookupRequest(requestBody) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ADDRESS_LOOKUP_REQUEST_STORAGE_KEY, JSON.stringify(requestBody));
  } catch {
    // Request persistence is best-effort for auth redirects.
  }
}

function clearAddressLookupRequest() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ADDRESS_LOOKUP_REQUEST_STORAGE_KEY);
  } catch {
    // Request cleanup is best-effort.
  }
}

function onlyHouseNumberChars(value) {
  return value.replace(/[^\d/]/g, "").slice(0, HOUSE_NUMBER_MAX_LENGTH);
}

function onlyDigits(value, maxLength) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export default function CadastruSearchForm({
  className = "",
  quickSearchPlacement = "bottom",
  showLocationHeader = false,
  locationStepNumber = 2,
  allowAnonymousSearch = false,
}) {
  const { lang, t } = useTranslation();
  const { session, isAuthenticated, loading: authLoading, clearAuthError } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const skipCache = searchParams.get("skipcache") === "true";
  const [addressForm, setAddressForm] = useState({
    city: "Chișinău",
    roadType: "strada",
    street: "",
    houseNumber: "",
    apartmentNumber: "",
  });
  const [cadastralNumber, setCadastralNumber] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [lookupState, setLookupState] = useState({
    loading: false,
    method: null,
    error: "",
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    const savedDraft = readSavedDraft();
    if (savedDraft) {
      setAddressForm({
        city: CADASTRU_SUPPORTED_CITIES.includes(savedDraft?.addressForm?.city)
          ? savedDraft.addressForm.city
          : "Chișinău",
        roadType: savedDraft?.addressForm?.roadType === "bulevard" ? "bulevard" : "strada",
        street: typeof savedDraft?.addressForm?.street === "string" ? savedDraft.addressForm.street : "",
        houseNumber: typeof savedDraft?.addressForm?.houseNumber === "string" ? savedDraft.addressForm.houseNumber : "",
        apartmentNumber: typeof savedDraft?.addressForm?.apartmentNumber === "string" ? savedDraft.addressForm.apartmentNumber : "",
      });
      if (typeof savedDraft?.cadastralNumber === "string") {
        setCadastralNumber(savedDraft.cadastralNumber);
      }
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    writeSavedDraft({ addressForm, cadastralNumber });
  }, [addressForm, cadastralNumber, draftReady]);

  const requireAuth = () => {
    if (allowAnonymousSearch || isAuthenticated) return false;
    writeSavedDraft({ addressForm, cadastralNumber });
    clearAuthError();
    setLookupState({ loading: false, method: null, error: "" });
    setIsAuthModalOpen(true);
    return true;
  };

  const setAddressField = (field, value) => {
    setAddressForm((current) => ({ ...current, [field]: value }));
  };

  const validateAddressFields = () => {
    const street = addressForm.street.trim();
    const houseNumber = addressForm.houseNumber.trim();
    const apartmentNumber = addressForm.apartmentNumber.trim();

    if (!street || !houseNumber) {
      return t("cadastru.missingAddressFields");
    }

    if (
      street.length > STREET_MAX_LENGTH ||
      houseNumber.length > HOUSE_NUMBER_MAX_LENGTH ||
      (apartmentNumber && apartmentNumber.length > APARTMENT_NUMBER_MAX_LENGTH)
    ) {
      return t("cadastru.invalidAddressFields");
    }

    if (!HOUSE_NUMBER_PATTERN.test(houseNumber) || (apartmentNumber && !APARTMENT_NUMBER_PATTERN.test(apartmentNumber))) {
      return t("cadastru.invalidAddressFields");
    }

    if (apartmentNumber) {
      const apartmentNumberValue = Number(apartmentNumber);
      if (apartmentNumberValue < 1 || apartmentNumberValue > MAX_APARTMENT_NUMBER) {
        return t("cadastru.invalidAddressFields");
      }
    }

    return "";
  };

  const readErrorMessage = async (response) => {
    try {
      const payload = await response.json();
      if (payload?.error === "unauthorized") return t("cadastru.loginToUse");
      if (payload?.error === "invalid_format") return t("form.cadastralInvalid");
      if (payload?.error === "missing_fields") return t("cadastru.missingAddressFields");
      if (payload?.error === "invalid_address_fields") return t("cadastru.invalidAddressFields");
      if (payload?.error === "too_many_requests") return t("cadastru.rateLimitError");
      if (payload?.error === "not_found") return t("cadastru.lookupError");
      return payload?.message || payload?.error || t("cadastru.lookupError");
    } catch {
      return t("cadastru.lookupError");
    }
  };

  const requestHeaders = () => ({
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  });

  const submitAddressSearch = async () => {
    if (requireAuth()) return;

    const validationError = validateAddressFields();
    if (validationError) {
      setLookupState({ loading: false, method: "address", error: validationError });
      return;
    }

    setLookupState({ loading: true, method: "address", error: "" });

    const requestBody = {
      city: addressForm.city,
      road_type: addressForm.roadType,
      street: addressForm.street,
      house_number: addressForm.houseNumber,
      ...(addressForm.apartmentNumber ? { apartment_number: addressForm.apartmentNumber } : {}),
      search_context: "cadastru",
      ...(skipCache ? { skip_cache: true } : {}),
    };
    writeAddressLookupRequest(requestBody);

    try {
      const response = await fetch("/api/cadastru/address", {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 401) {
          clearAuthError();
          setLookupState({ loading: false, method: "address", error: "" });
          setIsAuthModalOpen(true);
          return;
        }
        setLookupState({
          loading: false,
          method: "address",
          error: await readErrorMessage(response),
        });
        return;
      }

      const data = await response.json();
      if (data?.locked_sections?.cadastru_details === true) {
        writeAddressResultPreview(data);
        const params = new URLSearchParams({
          source: "address",
          preview: "1",
          ...(skipCache ? { skipcache: "true" } : {}),
        });
        router.push(`/${lang}/cadastru/rezultat?${params.toString()}`);
        return;
      }

      if (data?.cadastral_number) {
        clearAddressResultPreview();
        clearAddressLookupRequest();
        const params = new URLSearchParams({
          cadastral_number: data.cadastral_number,
          source: "address",
          ...(skipCache ? { skipcache: "true" } : {}),
        });
        router.push(`/${lang}/cadastru/rezultat?${params.toString()}`);
        return;
      }

      if (data?.lands?.length || data?.buildings?.length) {
        writeAddressResultPreview(data);
        const params = new URLSearchParams({
          source: "address",
          result: "1",
          ...(skipCache ? { skipcache: "true" } : {}),
        });
        router.push(`/${lang}/cadastru/rezultat?${params.toString()}`);
        return;
      }

      setLookupState({ loading: false, method: "address", error: t("cadastru.lookupError") });
    } catch {
      setLookupState({
        loading: false,
        method: "address",
        error: t("cadastru.lookupError"),
      });
    }
  };

  const submitNumberSearch = async () => {
    if (requireAuth()) return;

    const validation = validateCadastralNumber(cadastralNumber);
    if (!validation.valid) {
      setLookupState({ loading: false, method: "number", error: t("form.cadastralInvalid") });
      return;
    }

    setLookupState({ loading: true, method: "number", error: "" });
    clearAddressResultPreview();
    clearAddressLookupRequest();
    const params = new URLSearchParams({
      cadastral_number: validation.value,
      source: "number",
      ...(skipCache ? { skipcache: "true" } : {}),
    });
    router.push(`/${lang}/cadastru/rezultat?${params.toString()}`);
  };

  const quickSearchBlock = quickSearchPlacement === "top" ? (
    <div className={quickSearchPlacement === "bottom" ? "border-t border-gray-200 pt-8" : ""}>
      {showLocationHeader && (
        <div className="mb-5 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
            {locationStepNumber}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {t("form.locationSection")}
          </span>
        </div>
      )}
      <CadastralQuickSearchCard
        value={cadastralNumber}
        onChange={(value) => {
          setCadastralNumber(value);
          if (lookupState.method === "number" && lookupState.error) {
            setLookupState({ loading: false, method: null, error: "" });
          }
        }}
        onSearch={submitNumberSearch}
        loading={lookupState.loading && lookupState.method === "number"}
        disabled={authLoading}
        error={lookupState.method === "number" ? lookupState.error : ""}
      />
    </div>
  ) : (
    <div className="border-t border-gray-200 pt-8">
      <h2 className="text-lg font-semibold tracking-tight text-gray-950">
        {t("cadastru.numberSectionTitle")}
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {t("cadastru.numberSectionSubtitle")}
      </p>

      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="text-sm font-semibold text-gray-700">
            {t("cadastru.numberLabel")}
          </span>
          <input
            type="text"
            inputMode="text"
            value={cadastralNumber}
            onChange={(event) => {
              setCadastralNumber(event.target.value);
              if (lookupState.method === "number" && lookupState.error) {
                setLookupState({ loading: false, method: null, error: "" });
              }
            }}
            placeholder={t("form.cadastralPlaceholder")}
            className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
          />
        </label>

        <button
          type="button"
          onClick={submitNumberSearch}
          disabled={lookupState.loading || authLoading}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-base font-semibold text-gray-800 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 sm:w-auto"
        >
          {lookupState.loading && lookupState.method === "number"
            ? t("cadastru.searching")
            : t("cadastru.numberSearchButton")}
        </button>
      </div>
    </div>
  );

  return (
    <div className={className}>
      <AuthRequiredModal
        open={isAuthModalOpen}
        copyKey="cadastru.loginToUse"
        onClose={() => setIsAuthModalOpen(false)}
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
          {quickSearchPlacement === "top" && quickSearchBlock}

          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-950">
              {t("cadastru.addressSectionTitle")}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {t("cadastru.addressSectionSubtitle")}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                {t("cadastru.city")}
              </span>
              <select
                value={addressForm.city}
                onChange={(event) => setAddressField("city", event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base font-medium text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-light"
              >
                {CADASTRU_SUPPORTED_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                {t("cadastru.roadType")}
              </span>
              <select
                value={addressForm.roadType}
                onChange={(event) => setAddressField("roadType", event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base font-medium text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-light"
              >
                {roadTypes.map((roadType) => (
                  <option key={roadType.value} value={roadType.value}>
                    {t(roadType.label)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                {t("cadastru.street")}
              </span>
              <input
                type="text"
                maxLength={STREET_MAX_LENGTH}
                value={addressForm.street}
                onChange={(event) => setAddressField("street", event.target.value)}
                placeholder={t("cadastru.streetPlaceholder")}
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                {t("cadastru.houseNumber")}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{1,4}(?:/\d{1,4})?"
                maxLength={HOUSE_NUMBER_MAX_LENGTH}
                value={addressForm.houseNumber}
                onChange={(event) => setAddressField("houseNumber", onlyHouseNumberChars(event.target.value))}
                placeholder="ex. 18/2"
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">
                {t("cadastru.apartmentNumber")}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{1,4}"
                maxLength={APARTMENT_NUMBER_MAX_LENGTH}
                value={addressForm.apartmentNumber}
                onChange={(event) => setAddressField("apartmentNumber", onlyDigits(event.target.value, APARTMENT_NUMBER_MAX_LENGTH))}
                placeholder={t("cadastru.apartmentPlaceholder")}
                className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
              />
            </label>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={submitAddressSearch}
              disabled={lookupState.loading || authLoading}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
            >
              {lookupState.loading && lookupState.method === "address"
                ? t("cadastru.searching")
                : t("cadastru.searchButton")}
            </button>
          </div>

          {quickSearchPlacement === "bottom" && quickSearchBlock}

          {lookupState.error && (quickSearchPlacement !== "top" || lookupState.method !== "number") && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-red-800">
              <p className="text-sm font-medium">{lookupState.error}</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

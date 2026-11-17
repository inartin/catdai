"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseStreetInput } from "@/lib/cadastru-street-input";
import CadastruAddressPicker from "@/components/CadastruAddressPicker";
import CadastruLocalityInput from "@/components/CadastruLocalityInput";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import CadastralQuickSearchCard from "@/components/CadastralQuickSearchCard";
import CadastruResultLoading from "@/components/CadastruResultLoading";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { CADASTRU_SUPPORTED_CITIES } from "@/lib/cadastru-supported-cities";

const roadTypes = [
  { value: "strada", label: "cadastru.roadTypeStreetFull" },
  { value: "str-la", label: "cadastru.roadTypeLaneFull" },
  { value: "bulevard", label: "cadastru.roadTypeBoulevardFull" },
  { value: "sos", label: "cadastru.roadTypeHighwayFull" },
];
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

export function CadastruMapAttribution({ className }) {
  return (
    <p className={`text-xs ${className}`}>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
      {" · "}
      <a href="https://map.md/" target="_blank" rel="noreferrer">© map.md</a>
    </p>
  );
}

export default function CadastruSearchForm({
  className = "",
  quickSearchPlacement = "bottom",
  showLocationHeader = false,
  locationStepNumber = 2,
  allowAnonymousSearch = false,
  compactOnMobile = false,
  onSearchStart,
  pricingNote,
  showMapAttribution = true,
}) {
  const { lang, t } = useTranslation();
  const fieldSpacing = compactOnMobile ? "mt-[6.5px] sm:mt-2" : "mt-2";
  const { isAuthenticated, loading: authLoading, clearAuthError } = useAuth();
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
  const [addressReady, setAddressReady] = useState(false);
  const [cadastralNumber, setCadastralNumber] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const pendingSearch=useRef(null);
  useEffect(() => () => pendingSearch.current?.abort(), []);

  useEffect(() => {
    const savedDraft = readSavedDraft();
    if (savedDraft) {
      setAddressForm({
        city: CADASTRU_SUPPORTED_CITIES.includes(savedDraft?.addressForm?.city)
          ? savedDraft.addressForm.city
          : "Chișinău",
        roadType: roadTypes.some(({ value }) => value === savedDraft?.addressForm?.roadType)
          ? savedDraft.addressForm.roadType
          : "strada",
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
    setLoadingSearch(null);
    setIsAuthModalOpen(true);
    return true;
  };

  const setAddressField = (field, value) => {
    if(field === "city") setAddressReady(false);
    setAddressForm((current) => ({ ...current, [field]: value }));
  };

  const updateAddressForm = next => {
    if(next.city!==addressForm.city || next.street!==addressForm.street || next.roadType!==addressForm.roadType)setAddressReady(false);
    setAddressForm(next);
  };

  const submitAddressSearch = async () => {
    if (authLoading || !addressForm.city || !addressForm.street.trim() || !addressForm.houseNumber || requireAuth()) return;
    clearAddressResultPreview();
    const requestBody = {
      city: addressForm.city,
      road_type: addressForm.roadType,
      street: addressForm.street,
      house_number: addressForm.houseNumber,
      ...(addressForm.apartmentNumber ? { apartment_number: addressForm.apartmentNumber } : {}),
      search_context: "cadastru",
      lookup_id: crypto.randomUUID(),
      ...(skipCache ? { skip_cache: true } : {}),
    };
    pendingSearch.current?.abort();
    const controller=new AbortController();pendingSearch.current=controller;
    setLoadingSearch({ address: requestBody });
    if(!addressReady) {
      const parsed=parseStreetInput(addressForm.street);
      requestBody.street=parsed.street;requestBody.road_type=parsed.road_type||addressForm.roadType;
      try {
        const response=await fetch(`/api/cadastru/address-options?${new URLSearchParams({city:addressForm.city,q:addressForm.street,resolve:'1'})}`, {signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
        if(response.ok) {
          const result=await response.json();
          if(controller.signal.aborted)return;
          // Suggestions may refine a unique match, but never block a manual search.
          if(result.status==='exact' && result.address?.street && roadTypes.some(type=>type.value===result.address.road_type)) {
            requestBody.street=result.address.street;requestBody.road_type=result.address.road_type;
          }
        }
      } catch { /* The ordinary exact lookup still accepts manual addresses. */ }
    }
    if(controller.signal.aborted)return;
    onSearchStart?.({ address: requestBody });
    writeAddressLookupRequest(requestBody);
    const params = new URLSearchParams({
      source: "address",
      lookup: "1",
      lookup_id: requestBody.lookup_id,
      city: requestBody.city,
      road_type: requestBody.road_type,
      street: requestBody.street,
      house_number: requestBody.house_number,
      ...(requestBody.apartment_number ? { apartment_number: requestBody.apartment_number } : {}),
      ...(skipCache ? { skipcache: "true" } : {}),
    });
    router.push(`/${lang}/cadastru/rezultat?${params.toString()}`);
  };

  const submitNumberSearch = () => {
    if (authLoading || !cadastralNumber.trim()) return;
    if (requireAuth()) return;

    setLoadingSearch({ cadastralNumber: cadastralNumber.trim() });
    onSearchStart?.({ cadastralNumber: cadastralNumber.trim() });
    clearAddressResultPreview();
    clearAddressLookupRequest();
    const params = new URLSearchParams({
      cadastral_number: cadastralNumber.trim(),
      source: "number",
      lookup_id: crypto.randomUUID(),
      ...(skipCache ? { skipcache: "true" } : {}),
    });
    router.push(`/${lang}/cadastru/rezultat?${params.toString()}`);
  };

  if (loadingSearch) return <CadastruResultLoading {...loadingSearch} />;

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
        onChange={setCadastralNumber}
        onSearch={submitNumberSearch}
        disabled={authLoading}
      />
    </div>
  ) : (
    <div className={`border-t border-gray-200 ${compactOnMobile ? "pt-[26px] sm:pt-8" : "pt-8"}`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-950">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" x2="20" y1="9" y2="9" />
          <line x1="4" x2="20" y1="15" y2="15" />
          <line x1="10" x2="8" y1="3" y2="21" />
          <line x1="16" x2="14" y1="3" y2="21" />
        </svg>
        <span>{t("cadastru.numberSectionTitle")}</span>
      </h2>
  

      <div className={`grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end ${compactOnMobile ? "mt-4 gap-4 sm:mt-5 sm:gap-5" : "mt-5 gap-5"}`}>
        <label className="block">
          <span className="text-sm font-semibold text-gray-700">
            {t("cadastru.numberLabel")}
          </span>
          <input
            type="text"
            inputMode="text"
            value={cadastralNumber}
            onChange={(event) => setCadastralNumber(event.target.value)}
            placeholder={t("form.cadastralPlaceholder")}
            className={`${fieldSpacing} h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light`}
          />
        </label>

        <button
          type="button"
          onClick={submitNumberSearch}
          disabled={authLoading || !cadastralNumber.trim()}
          className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-base font-semibold text-gray-800 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-700 sm:w-auto"
        >
          {t("cadastru.numberSearchButton")}
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

      <div className={`rounded-2xl border border-gray-200 bg-white px-6 shadow-sm sm:p-8 lg:p-10 ${compactOnMobile ? "py-5" : "py-6"}`}>
        <form autoComplete="off" className={compactOnMobile ? "space-y-5 sm:space-y-6" : "space-y-6"} onSubmit={(event) => event.preventDefault()}>
          {quickSearchPlacement === "top" && quickSearchBlock}

          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-950">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span>{t("cadastru.addressSectionTitle")}</span>
            </h2>
            <p className={`text-sm text-gray-500 ${compactOnMobile ? "mt-[3.25px] sm:mt-1" : "mt-1"}`}>
              {t("cadastru.addressSectionSubtitle")}
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-gray-700">{lang === "en" ? "Locality" : lang === "ru" ? "Населённый пункт" : "Localitate"}</span>
            <CadastruLocalityInput value={addressForm.city} lang={lang} onChange={(value) => setAddressField("city", value)} compactOnMobile={compactOnMobile} />
          </label>
          <CadastruAddressPicker value={addressForm} onChange={updateAddressForm} onReady={setAddressReady} lang={lang} t={t} compactOnMobile={compactOnMobile} />

          <div className={compactOnMobile ? "pt-[6.5px] sm:pt-2" : "pt-2"}>
            <button
              type="button"
              onClick={() => submitAddressSearch()}
              disabled={authLoading || !addressForm.city || !addressForm.street.trim() || !addressForm.houseNumber}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-white shadow-sm transition-colors enabled:hover:bg-primary-dark disabled:cursor-not-allowed disabled:border disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-700 disabled:hover:border-gray-300 sm:w-auto"
            >
              {t("cadastru.searchButton")}
            </button>
          </div>

          {quickSearchPlacement === "bottom" && quickSearchBlock}
          {pricingNote && (
            <p className="flex items-start justify-center gap-1.5 text-center text-xs text-gray-600 sm:justify-start sm:gap-2 sm:text-left sm:text-sm">
              <svg
                viewBox="0 0 24 24"
                className="mt-px h-3.5 w-3.5 shrink-0 text-gray-500 sm:mt-0.5 sm:h-4 sm:w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4m0-4h.01" />
              </svg>
              <span className="text-balance sm:text-wrap">{pricingNote}</span>
            </p>
          )}
        </form>
        {showMapAttribution && <CadastruMapAttribution className="mt-4 text-gray-400" />}
      </div>
    </div>
  );
}

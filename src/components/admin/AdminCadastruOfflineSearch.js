"use client";

import { useState } from "react";
import CadastralDataCard from "@/components/CadastralDataCard";
import CadastruNearbyCard from "@/components/CadastruNearbyCard";
import CadastruPublicTransportCard from "@/components/CadastruPublicTransportCard";
import CadastruMunicipalReportsCard from "@/components/CadastruMunicipalReportsCard";
import { CADASTRU_SUPPORTED_CITIES } from "@/lib/cadastru-supported-cities";
import { useTranslation } from "@/context/LanguageContext";

const roadTypes = [
  { value: "strada", label: "cadastru.roadTypeStreetFull", ro: "Strada" },
  { value: "str-la", label: "cadastru.roadTypeLaneFull", ro: "Stradelă" },
  { value: "bulevard", label: "cadastru.roadTypeBoulevardFull", ro: "Bulevard" },
];

const STREET_MAX_LENGTH = 80;
const HOUSE_NUMBER_MAX_LENGTH = 10;
const APARTMENT_NUMBER_MAX_LENGTH = 4;

const SAMPLE_RECORDS = [
  {
    label: "0100106.131.01.051 · Decebal 63, ap. 51 (cu Nearby & Transport)",
    cadastralNumber: "0100106.131.01.051",
    address: {
      city: "Chișinău",
      roadType: "bulevard",
      street: "Decebal",
      houseNumber: "63",
      apartmentNumber: "51",
    },
  },
  {
    label: "0100414.176.01.044 · Matei Basarab 16/1, ap. 44 (cu Hartă)",
    cadastralNumber: "0100414.176.01.044",
    address: {
      city: "Chișinău",
      roadType: "strada",
      street: "Matei Basarab",
      houseNumber: "16/1",
      apartmentNumber: "44",
    },
  },
  {
    label: "3153216.101.01 · Stăuceni, Tineretului 11",
    cadastralNumber: "3153216.101.01",
    address: {
      city: "Stăuceni",
      roadType: "strada",
      street: "Tineretului",
      houseNumber: "11",
      apartmentNumber: "",
    },
  },
];

function onlyHouseNumberChars(value) {
  return value.replace(/[^\da-z/]/gi, "").toUpperCase().slice(0, HOUSE_NUMBER_MAX_LENGTH);
}

function onlyDigits(value, maxLength) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ro-RO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(value);
  }
}

export default function AdminCadastruOfflineSearch() {
  const { lang, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({
    city: "Chișinău",
    roadType: "strada",
    street: "",
    houseNumber: "",
    apartmentNumber: "",
  });
  const [cadastralNumber, setCadastralNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResult, setSearchResult] = useState(null);

  const setAddressField = (field, value) => {
    setAddressForm((current) => ({ ...current, [field]: value }));
  };

  const executeSearch = async (body) => {
    setLoading(true);
    setSearchError(null);
    setSearchResult(null);
    setIsOpen(true);

    try {
      const response = await fetch("/api/admin/cadastru-storage/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok && !data.fallback_address && !data.cadastral) {
        setSearchError(data.message || data.error || "Nu s-au găsit date locale.");
        if (data.available_units?.length) {
          setSearchResult({ available_units: data.available_units });
        }
        return;
      }

      setSearchResult(data);
    } catch (err) {
      setSearchError(err?.message || "Eroare la căutarea datelor locale.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSearch = () => {
    if (!addressForm.street.trim() || !addressForm.houseNumber.trim()) {
      setSearchError("Vă rugăm să specificați strada și numărul casei.");
      return;
    }

    executeSearch({
      city: addressForm.city,
      road_type: addressForm.roadType,
      street: addressForm.street.trim(),
      house_number: addressForm.houseNumber.trim(),
      ...(addressForm.apartmentNumber.trim() ? { apartment_number: addressForm.apartmentNumber.trim() } : {}),
    });
  };

  const handleNumberSearch = (customNumber) => {
    const numberToSearch = (customNumber || cadastralNumber).trim();
    if (!numberToSearch) {
      setSearchError("Introduceți un număr cadastral valid.");
      return;
    }

    executeSearch({ cadastral_number: numberToSearch });
  };

  const selectSample = (sample) => {
    setCadastralNumber(sample.cadastralNumber);
    setAddressForm(sample.address);
    executeSearch({ cadastral_number: sample.cadastralNumber });
  };

  const selectAvailableUnit = (unit) => {
    if (unit.cadastral_number) {
      setCadastralNumber(unit.cadastral_number);
      executeSearch({ cadastral_number: unit.cadastral_number });
    } else if (unit.apartment_number) {
      setAddressField("apartmentNumber", unit.apartment_number);
      executeSearch({
        city: addressForm.city,
        road_type: addressForm.roadType,
        street: addressForm.street,
        house_number: addressForm.houseNumber,
        apartment_number: unit.apartment_number,
      });
    }
  };

  // Map location resolution (same logic as CadastruResultPage)
  const cadastral = searchResult?.cadastral;
  const nearbyData = searchResult?.nearby;
  const transportData = searchResult?.public_transport;
  const municipalReportsData = searchResult?.municipal_reports;
  const storageInfo = searchResult?.storage_info;

  const mapLocation = [
    cadastral?.map_location,
    ...(searchResult?.fallback_address ? [nearbyData?.location] : []),
    cadastral?.building?.map_location,
    cadastral?.apartment?.map_location,
    ...(Array.isArray(cadastral?.buildings) ? cadastral.buildings.map((property) => property?.map_location) : []),
    ...(Array.isArray(cadastral?.lands) ? cadastral.lands.map((property) => property?.map_location) : []),
    nearbyData?.location,
  ].find((location) => Number.isFinite(location?.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location?.longitude) && Math.abs(location.longitude) <= 180);

  const hasMapLocation = Boolean(mapLocation);
  const mapUrl = hasMapLocation
    ? `https://www.google.com/maps?${new URLSearchParams({
        q: `${mapLocation.latitude},${mapLocation.longitude}`,
        ll: `${mapLocation.latitude},${mapLocation.longitude}`,
        t: "k",
        z: "18",
        hl: lang || "ro",
        output: "embed",
      })}`
    : null;

  const mapIframe = mapUrl ? (
    <div className="mt-6 w-full overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-md">
      <iframe
        key={mapUrl}
        src={mapUrl}
        title={t("cadastru.mapTitle") || "Hartă Satelit"}
        className="block h-[360px] w-full border-0 sm:h-[440px]"
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  ) : null;

  return (
    <div className="w-full max-w-4xl">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all">
        {/* Collapsible Banner Header */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-gray-50/80 sm:p-6"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-gray-950 sm:text-lg">
                  Căutare Cadastru Local (Mod Offline)
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Cache & Bază de date
                </span>
                {searchResult && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    Rezultat activ
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {isOpen
                  ? "Formular copiat din cadastru · Fără solicitări API externe · Testare date locale"
                  : "Apasă pentru a deschide formularul de căutare offline și verificarea datelor locale"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-gray-500 hidden sm:inline">
              {isOpen ? "Restrânge" : "Deschide căutarea"}
            </span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </button>

        {/* Collapsible Content: Search Form & Results */}
        {isOpen && (
          <div className="border-t border-gray-100 bg-gray-50/40 p-5 sm:p-7 space-y-6">
            {/* Search Form Card */}
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="offline-search-form-title">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 id="offline-search-form-title" className="text-lg font-bold tracking-tight text-gray-950">
                    Formular de căutare Cadastru
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Căutare după adresă sau număr cadastral cu omiterea apelurilor către furnizorii externi.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:self-center">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  API extern oprit
                </div>
              </div>

              {/* Quick Sample Links */}
              <div className="mt-4 flex flex-wrap items-center gap-2 pt-2">
                <span className="text-xs font-medium text-gray-500">Exemple stocate în BD:</span>
                {SAMPLE_RECORDS.map((sample) => (
                  <button
                    key={sample.cadastralNumber}
                    type="button"
                    onClick={() => selectSample(sample)}
                    disabled={loading}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>

              {/* Form Inputs */}
              <form className="mt-6 space-y-6" onSubmit={(event) => event.preventDefault()}>
                {/* Address Section */}
                <div className="border-t border-gray-100 pt-5">
                  <h4 className="text-sm font-semibold tracking-tight text-gray-900">
                    {t("cadastru.addressSectionTitle")}
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t("cadastru.addressSectionSubtitle")}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">
                      {t("cadastru.city")}
                    </span>
                    <select
                      value={addressForm.city}
                      onChange={(event) => setAddressField("city", event.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-light"
                    >
                      {CADASTRU_SUPPORTED_CITIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">
                      {t("cadastru.roadType")}
                    </span>
                    <select
                      value={addressForm.roadType}
                      onChange={(event) => setAddressField("roadType", event.target.value)}
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-900 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-light"
                    >
                      {roadTypes.map((rt) => (
                        <option key={rt.value} value={rt.value}>
                          {t(rt.label) || rt.ro}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_160px_160px]">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">
                      {t("cadastru.street")}
                    </span>
                    <input
                      type="text"
                      maxLength={STREET_MAX_LENGTH}
                      value={addressForm.street}
                      onChange={(event) => setAddressField("street", event.target.value)}
                      placeholder={t("cadastru.streetPlaceholder") || "ex. Ștefan cel Mare"}
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">
                      {t("cadastru.houseNumber")}
                    </span>
                    <input
                      type="text"
                      inputMode="text"
                      pattern="\d{1,4}(?:/(?:\d{1,4}|[A-Za-z]))?"
                      maxLength={HOUSE_NUMBER_MAX_LENGTH}
                      value={addressForm.houseNumber}
                      onChange={(event) => setAddressField("houseNumber", onlyHouseNumberChars(event.target.value))}
                      placeholder="ex. 18/2, 22/D"
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-gray-700">
                      {t("cadastru.apartmentNumber")}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={APARTMENT_NUMBER_MAX_LENGTH}
                      value={addressForm.apartmentNumber}
                      onChange={(event) => setAddressField("apartmentNumber", onlyDigits(event.target.value, APARTMENT_NUMBER_MAX_LENGTH))}
                      placeholder={t("cadastru.apartmentPlaceholder") || "ex. 42"}
                      className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                    />
                  </label>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleAddressSearch}
                    disabled={loading}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
                  >
                    {loading ? "Căutare locală..." : "Caută adresă (offline)"}
                  </button>
                </div>

                {/* Quick Number Search Section */}
                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-sm font-semibold tracking-tight text-gray-950">
                    {t("cadastru.numberSectionTitle")}
                  </h4>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Căutare directă după codul cadastral stocat în baza de date sau cache.
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">
                        {t("cadastru.numberLabel")}
                      </span>
                      <input
                        type="text"
                        value={cadastralNumber}
                        onChange={(event) => setCadastralNumber(event.target.value)}
                        placeholder={t("form.cadastralPlaceholder") || "ex. 0100414.176.01.044"}
                        className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleNumberSearch()}
                      disabled={loading}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 sm:w-auto"
                    >
                      {loading ? "Căutare locală..." : t("cadastru.numberSearchButton") || "Caută număr (offline)"}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Loading Banner */}
            {loading && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-6 text-center text-sm font-medium text-blue-900">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-2 font-semibold">Căutare exclusiv în datele locale...</p>
                <p className="mt-0.5 text-xs text-blue-700">Se verifică memoria cache și baza de date Supabase fără solicitări către API-uri externe.</p>
              </div>
            )}

            {/* Error / Not Found Message */}
            {searchError && !loading && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
                <div className="flex items-start gap-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-amber-600 mt-0.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">{searchError}</p>
                    <p className="text-xs text-amber-800">
                      Toate solicitările către furnizori externi au fost oprite conform modului offline. Înregistrarea nu a fost găsită în stocul local.
                    </p>
                  </div>
                </div>

                {searchResult?.available_units?.length > 0 && (
                  <div className="mt-4 border-t border-amber-200 pt-3">
                    <p className="text-xs font-semibold text-amber-900">
                      Unități/apartamente stocate în baza de date la această adresă:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {searchResult.available_units.map((unit) => (
                        <button
                          key={unit.cadastral_number || unit.apartment_number}
                          type="button"
                          onClick={() => selectAvailableUnit(unit)}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
                        >
                          {unit.apartment_number ? `Ap. ${unit.apartment_number}` : unit.cadastral_number}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Results View */}
            {searchResult && !loading && (cadastral || searchResult.fallback_address) && (
              <div className="space-y-6">
                {/* Storage Metadata Banner */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-3 w-3 rounded-full bg-emerald-500" />
                      <h4 className="text-sm font-bold text-emerald-950">
                        {cadastral ? "Date locale găsite cu succes" : "Date parțiale de zonă găsite"}
                      </h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md bg-white px-2.5 py-1 font-semibold text-emerald-800 border border-emerald-200">
                        Sursă: {storageInfo?.source === "cache" ? "Memorie Cache" : "Bază de date"}
                      </span>
                      <span className={`rounded-md px-2.5 py-1 font-semibold border ${storageInfo?.is_fresh ? "bg-white text-emerald-800 border-emerald-200" : "bg-amber-100 text-amber-900 border-amber-300"}`}>
                        {storageInfo?.is_fresh ? "Snapshot activ" : "Snapshot expirat (păstrat)"}
                      </span>
                      <span className="rounded-md bg-white px-2.5 py-1 font-medium text-gray-700 border border-gray-200">
                        API extern: 0 solicitări
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-600 sm:grid-cols-4">
                    <div>
                      <span className="text-gray-500">Salvat la:</span>
                      <p className="font-semibold text-gray-900">{fmtDate(storageInfo?.saved_at)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Preluare oficială:</span>
                      <p className="font-semibold text-gray-900">{fmtDate(storageInfo?.last_official_fetch_at)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Expiră la:</span>
                      <p className="font-semibold text-gray-900">{fmtDate(storageInfo?.expires_at)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Accesări stocate:</span>
                      <p className="font-semibold text-gray-900">{storageInfo?.lookup_count ?? 0}</p>
                    </div>
                  </div>
                </div>

                {/* Cadastral Data Card with Map embed (same as result page) */}
                {cadastral && (
                  <div className="overflow-visible bg-gray-50 p-1">
                    <CadastralDataCard
                      cadastral={cadastral}
                      locked={false}
                      showRevealButton={false}
                    >
                      {mapIframe}
                    </CadastralDataCard>
                  </div>
                )}

                {/* Fallback map if cadastral data is missing but location exists */}
                {!cadastral && searchResult.fallback_address && mapIframe}

                {/* Cadastru Nearby Places Card (same as result page) */}
                <CadastruNearbyCard
                  nearby={nearbyData}
                  loading={false}
                  unavailable={!nearbyData}
                />

                {/* Cadastru Public Transport Card (same as result page) */}
                <CadastruPublicTransportCard
                  transport={transportData}
                  loading={false}
                  unavailable={!transportData}
                />

                {/* Cadastru Municipal Reports Card (same as result page) */}
                {municipalReportsData ? (
                  <CadastruMunicipalReportsCard
                    reports={municipalReportsData}
                    loading={false}
                    unavailable={false}
                  />
                ) : (
                  <section className="mx-1 mt-6 rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm sm:p-7">
                    <h3 className="text-xl font-bold text-gray-950 sm:text-2xl">{t("cadastru.reportsTitle") || "Sesizări municipale"}</h3>
                    <p className="mt-4 text-sm text-gray-500">
                      Sesizările municipale nu sunt stocate permanent în baza de date locală (solicitările către API extern au fost omise).
                    </p>
                  </section>
                )}

                {/* Reset Search Button */}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchResult(null);
                      setSearchError(null);
                    }}
                    className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                  >
                    Închide rezultatul
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

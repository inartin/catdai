"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CadastruSourceNote from "@/components/CadastruSourceNote";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

const roadTypes = [
  { value: "strada", label: "cadastru.roadTypeStreet" },
  { value: "bulevard", label: "cadastru.roadTypeBoulevard" },
];

export default function CadastruPage() {
  const { lang, t } = useTranslation();
  const { session } = useAuth();
  const router = useRouter();
  const [addressForm, setAddressForm] = useState({
    roadType: "strada",
    street: "",
    houseNumber: "",
    apartmentNumber: "",
  });
  const [cadastralNumber, setCadastralNumber] = useState("");
  const [lookupState, setLookupState] = useState({
    loading: false,
    method: null,
    error: "",
  });

  const setAddressField = (field, value) => {
    setAddressForm((current) => ({ ...current, [field]: value }));
  };

  const readErrorMessage = async (response) => {
    try {
      const payload = await response.json();
      if (payload?.error === "invalid_format") return t("form.cadastralInvalid");
      if (payload?.error === "missing_fields") return t("cadastru.missingAddressFields");
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
    setLookupState({ loading: true, method: "address", error: "" });

    try {
      const response = await fetch("/api/cadastru/address", {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({
          city: "Chișinău",
          road_type: addressForm.roadType,
          street: addressForm.street,
          house_number: addressForm.houseNumber,
          apartment_number: addressForm.apartmentNumber,
        }),
      });

      if (!response.ok) {
        setLookupState({
          loading: false,
          method: "address",
          error: await readErrorMessage(response),
        });
        return;
      }

      const data = await response.json();
      if (data?.cadastral_number) {
        router.push(`/${lang}/cadastru/rezultat?cadastral_number=${encodeURIComponent(data.cadastral_number)}`);
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
    setLookupState({ loading: true, method: "number", error: "" });

    try {
      const response = await fetch("/api/cadastral", {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify({ cadastral_number: cadastralNumber, search_context: "cadastru" }),
      });

      if (!response.ok) {
        setLookupState({
          loading: false,
          method: "number",
          error: await readErrorMessage(response),
        });
        return;
      }

      const data = await response.json();
      router.push(`/${lang}/cadastru/rezultat?cadastral_number=${encodeURIComponent(data?.cadastral_number || cadastralNumber.trim())}`);
    } catch {
      setLookupState({
        loading: false,
        method: "number",
        error: t("cadastru.lookupError"),
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {t("cadastru.pageTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-gray-600">
              {t("cadastru.subtitle")}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
            <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
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
                  <input
                    type="text"
                    value="Chișinău"
                    readOnly
                    aria-readonly="true"
                    className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-gray-100 px-4 text-base font-medium text-gray-700 outline-none"
                  />
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
                    inputMode="text"
                    value={addressForm.houseNumber}
                    onChange={(event) => setAddressField("houseNumber", event.target.value)}
                    placeholder="18/2"
                    className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">
                    {t("cadastru.apartmentNumber")}
                  </span>
                  <input
                    type="text"
                    inputMode="text"
                    value={addressForm.apartmentNumber}
                    onChange={(event) => setAddressField("apartmentNumber", event.target.value)}
                    placeholder={t("cadastru.apartmentPlaceholder")}
                    className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                  />
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={submitAddressSearch}
                  disabled={lookupState.loading}
                  className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
                >
                  {lookupState.loading && lookupState.method === "address"
                    ? t("cadastru.searching")
                    : t("cadastru.searchButton")}
                </button>
              </div>

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
                      onChange={(event) => setCadastralNumber(event.target.value)}
                      placeholder={t("form.cadastralPlaceholder")}
                      className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary-light"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={submitNumberSearch}
                    disabled={lookupState.loading}
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-base font-semibold text-gray-800 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 sm:w-auto"
                  >
                    {lookupState.loading && lookupState.method === "number"
                      ? t("cadastru.searching")
                      : t("cadastru.numberSearchButton")}
                  </button>
                </div>
              </div>

              {lookupState.error && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-red-800">
                  <p className="text-sm font-medium">{lookupState.error}</p>
                </div>
              )}
            </form>
          </div>
          <CadastruSourceNote />
        </section>
      </main>
      <Footer />
    </div>
  );
}

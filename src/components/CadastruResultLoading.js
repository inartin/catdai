"use client";

import { useSyncExternalStore } from "react";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";
import { useTranslation } from "@/context/LanguageContext";

function subscribeToStorage(onChange) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStoredAddress() {
  try {
    return sessionStorage.getItem("catdai:cadastru-address-lookup-request:v1");
  } catch {
    return null;
  }
}

function emptySnapshot() {
  return null;
}

export default function CadastruResultLoading({ cadastralNumber = "", address = null, useStoredAddress = false, detailsLoading = false }) {
  const { t } = useTranslation();
  const storedAddress = useSyncExternalStore(subscribeToStorage, useStoredAddress ? readStoredAddress : emptySnapshot, emptySnapshot);
  let searchAddress = address;
  if (!searchAddress && storedAddress) {
    try {
      searchAddress = JSON.parse(storedAddress);
    } catch {
      // A missing or invalid handoff leaves the generic loading message.
    }
  }
  const roadTypeKey = {
    strada: "cadastru.roadTypeStreet",
    "str-la": "cadastru.roadTypeLane",
    bulevard: "cadastru.roadTypeBoulevard",
    sos: "cadastru.roadTypeHighway",
  }[searchAddress?.road_type];
  const streetAddress = [
    roadTypeKey ? t(roadTypeKey) : searchAddress?.road_type,
    searchAddress?.street,
    searchAddress?.house_number,
  ].filter(Boolean).join(" ");
  const query = searchAddress ? [
    searchAddress.city,
    streetAddress,
    searchAddress.apartment_number ? `${t("cadastru.apartmentNumber")}: ${searchAddress.apartment_number}` : "",
  ].filter(Boolean).join(", ") : cadastralNumber;

  return (
    <div className="flex min-h-80 w-full flex-1 flex-col items-center justify-center px-6 py-8 text-center">
      <CadastruLoadingIcon className="mb-6 h-40 w-auto text-primary sm:h-48" ariaLabel={t("cadastru.searching")} />
      <p className="text-base font-semibold text-gray-900">{t("cadastru.searching")}</p>
      <p className="mt-2 min-h-6 max-w-xl break-words text-base text-gray-600">{query}</p>
      <p role="status" className="mt-3 max-w-md text-sm leading-relaxed text-gray-500">
        {t(detailsLoading ? "cadastru.detailsProgress" : "cadastru.searchProgress")}
      </p>
    </div>
  );
}

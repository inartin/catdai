"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CadastruLoadingPage from "@/components/CadastruLoadingPage";
import { getSavedCadastruAddress } from "@/lib/cadastru-favorites";

function SearchLoading() {
  const searchParams = useSearchParams();
  const address = getSavedCadastruAddress(searchParams);

  return <CadastruLoadingPage
    cadastralNumber={searchParams.get("cadastral_number") || ""}
    address={address}
    useStoredAddress={searchParams.get("source") === "address" && !address}
  />;
}

export default function CadastruRouteLoading() {
  return <Suspense fallback={<CadastruLoadingPage />}><SearchLoading /></Suspense>;
}

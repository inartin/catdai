"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EstimateResult from "@/components/EstimateResult";

function EvaluareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const city = searchParams.get("city");
    const district = searchParams.get("district");
    const rooms = searchParams.get("rooms");
    const area = searchParams.get("area");

    if (!city || !district || !rooms || !area) {
      router.replace("/");
      return;
    }

    const roomsRaw = rooms;
    const roomsVal = roomsRaw === "5+" ? 5 : parseInt(roomsRaw, 10);

    const bathroomsRaw = searchParams.get("bathrooms");
    const balconiesRaw = searchParams.get("balconies");
    const bathroomsVal =
      bathroomsRaw === "3+" ? 3 : bathroomsRaw ? parseInt(bathroomsRaw, 10) : null;
    const balconiesVal =
      balconiesRaw === "3+" ? 3 : balconiesRaw != null ? parseInt(balconiesRaw, 10) : null;

    fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city,
        district,
        rooms_count: roomsVal,
        area_m2: area,
        floor: searchParams.get("floor") || null,
        total_floors: searchParams.get("total_floors") || null,
        building_type: searchParams.get("building_type") || null,
        renovation: searchParams.get("renovation") || null,
        bathrooms_count: bathroomsVal,
        balconies_count: balconiesVal,
      }),
    })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) setError(data.message || data.error || "A apărut o eroare");
        else setResult(data);
      })
      .catch(() => setError("Eroare de conexiune. Încearcă din nou."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEdit = () => {
    const editParams = new URLSearchParams();
    ["city", "district", "rooms", "area", "floor", "total_floors", "building_type", "renovation", "bathrooms", "balconies"].forEach((key) => {
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
        <p className="text-sm text-gray-500">Se calculează estimarea...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center">
        <div className="p-5 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 mb-6">
          {error}
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 py-3 px-6 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Încearcă din nou
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

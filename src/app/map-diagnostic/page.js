"use client";

import CadastruParcelMap from "@/components/CadastruParcelMap";

const location = { latitude: 47.08525, longitude: 28.89172 };
const cadastral = { map_geometry: { type: "Polygon", coordinates: [
  [[28.8914, 47.0851], [28.892, 47.0851], [28.892, 47.0855], [28.8914, 47.0855], [28.8914, 47.0851]],
] } };

export default function MapDiagnostic() {
  return <main className="mx-auto max-w-5xl p-8">
    <h1>Temporary map rendering diagnostic - synthetic outline</h1>
    <CadastruParcelMap location={location} cadastral={cadastral} fallbackUrl="about:blank" />
  </main>;
}

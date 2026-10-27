"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTranslation } from "@/context/LanguageContext";
import { cadastruMapFeatures } from "@/lib/cadastru-map";

export default function CadastruParcelMap({ location, cadastral, fallbackUrl }) {
  const { t, lang } = useTranslation();
  const container = useRef(null);
  const mapRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [style, setStyle] = useState("satelite");
  const geometry = JSON.stringify(cadastruMapFeatures(cadastral));
  const latitude = location.latitude;
  const longitude = location.longitude;
  const hasBoundaries = JSON.parse(geometry).features.length > 0;

  useEffect(() => {
    let disposed = false;
    let map;
    setFailed(false);
    setReady(false);
    setStyle("satelite");
    const features = JSON.parse(geometry);
    import("maplibre-gl").then((gl) => {
      if (disposed || !container.current) return;
      gl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      map = new gl.Map({
        container: container.current,
        style: "/api/cadastru/map/styles/satelite/style.json",
        center: [longitude, latitude], zoom: 18, maxZoom: 21,
        // Split-tile caches can retain satellite-only layers across a style
        // switch. Keep complete source tiles so street buildings render at once.
        zoomLevelsToOverscale: undefined,
        dragRotate: false, pitchWithRotate: false,
        attributionControl: { compact: true, customAttribution: '<a href="https://map.md/" target="_blank" rel="noopener noreferrer">© map.md</a>' },
      });
      // MapLibre opens compact credits initially; keep its native click toggle.
      const attribution = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
      attribution?.classList.remove("maplibregl-compact-show");
      attribution?.removeAttribute("open");
      mapRef.current = map;
      map.addControl(new gl.NavigationControl({ showCompass: false }), "top-right");
      new gl.Marker({ color: "#047857" }).setLngLat([longitude, latitude]).addTo(map);
      let fitted = false;
      map.on("style.load", () => {
        if (disposed) return;
        setReady(true);
        if (!features.features.length) return;
        map.addSource("cadastru-properties", { type: "geojson", data: features });
        const color = ["match", ["get", "kind"], "building", "#fbbf24", "#34d399"];
        map.addLayer({ id: "cadastru-fill", type: "fill", source: "cadastru-properties",
          paint: { "fill-color": color, "fill-opacity": 0.15 } });
        map.addLayer({ id: "cadastru-outline", type: "line", source: "cadastru-properties",
          paint: { "line-color": color, "line-width": 3 } });
        if (!fitted) {
          const bounds = new gl.LngLatBounds();
          for (const feature of features.features) {
            const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
            for (const polygon of polygons) for (const ring of polygon) for (const point of ring) bounds.extend(point.slice(0, 2));
          }
          map.fitBounds(bounds, { padding: 48, maxZoom: 18, duration: 0 });
          fitted = true;
        }
      });
      map.on("error", (event) => {
        // A failed style cannot render the map. Individual tile failures should
        // retain the usable map rather than hide it during a transient outage.
        if (!disposed && (!map.style || event.error?.url?.includes("/style.json"))) setFailed(true);
      });
    }).catch((error) => { if (!disposed) { console.warn("Map initialization diagnostic:", error.message); setFailed(true); } });
    return () => { disposed = true; mapRef.current = null; map?.remove(); };
  }, [latitude, longitude, geometry, lang]);

  const changeStyle = (nextStyle) => {
    if (!mapRef.current || nextStyle === style) return;
    setStyle(nextStyle);
    setReady(false);
    mapRef.current.setStyle(`/api/cadastru/map/styles/${nextStyle}/style.json`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 px-4 py-2 text-xs sm:px-6">
        <div className="inline-flex gap-1" aria-label={t("cadastru.mapStyle")}>
          {[ ["satelite", "cadastru.mapSatellite"], ["map", "cadastru.mapStreet"] ].map(([value, label]) => (
            <button key={value} type="button" disabled={!ready || failed} aria-pressed={style === value}
              onClick={() => changeStyle(value)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 font-semibold disabled:cursor-default ${style === value ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"}`}>
              {t(label)}
            </button>
          ))}
        </div>
        {hasBoundaries && !failed && <span className="text-gray-600">{t("cadastru.mapBoundaries")}</span>}
      </div>
      <div className="relative h-[360px] w-full sm:h-[440px]">
        <div ref={container} role="region" aria-label={t("cadastru.mapTitle")} className={`h-full w-full ${failed ? "hidden" : ""}`} />
        {failed && <iframe src={fallbackUrl} title={t("cadastru.mapTitle")} className="h-full w-full border-0"
          loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
        {!ready && !failed && <div role="status" className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-sm text-emerald-800 shadow-sm">{t("cadastru.mapLoading")}</div>}
      </div>
    </div>
  );
}

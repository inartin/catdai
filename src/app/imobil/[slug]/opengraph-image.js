import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ── Label maps (Romanian, as the canonical language for sharable previews) ──

const BUILDING_TYPE = {
  "Construcţii noi": "Construcții noi",
  Secundar: "Secundar",
};

const RENOVATION = {
  Euroreparație: "Euroreparație",
  "Variantă albă": "Variantă albă",
  "Reparație cosmetică": "Reparație cosmetică",
  "Design individual": "Design individual",
  "Fără reparație": "Fără reparație",
  "Construcție nefinisată": "Nefinisată",
  "Are nevoie de reparație": "Nevoie reparație",
  "Dat în exploatare": "Dat în exploatare",
  "Variantă sură": "Variantă sură",
};

function floorLabel(floor, totalFloors) {
  if (!floor) return null;
  const f = Number(floor);
  const t = totalFloors ? Number(totalFloors) : null;
  if (f === 1) return "Parter";
  if (t && f === t) return `Etaj ultim (${f})`;
  return t ? `Etaj ${f}/${t}` : `Etaj ${f}`;
}

export default async function OgImage({ params }) {
  const { slug } = await params;

  const { data } = await supabaseAdmin
    .from("shared_links")
    .select("params")
    .eq("slug", slug)
    .maybeSingle();

  // Fallback card when slug is not found
  const p = data?.params || {};

  const city = p.city || "Chișinău";
  const district = p.district || "";
  const rooms = p.rooms || "";
  const area = p.area || "";
  const buildingType = BUILDING_TYPE[p.building_type] || p.building_type || "";
  const renovation = RENOVATION[p.renovation] || p.renovation || "";
  const floor = floorLabel(p.floor, p.total_floors);
  const balconies = (() => {
    const b = p.balconies;
    if (b == null || b === "") return null;
    const n = Number(b);
    if (n === 0) return "Fără balcon";
    if (n === 1) return "1 balcon";
    return `${n} balcoane`;
  })();

  const roomsLabel =
    rooms === "1" ? "1 cameră" : rooms ? `${rooms} camere` : "";
  const titleParts = [roomsLabel, area ? `${area}m²` : ""].filter(Boolean);
  const title = titleParts.length
    ? `Apartament ${titleParts.join(" · ")}`
    : "Apartament";
  const subtitle = [district, city].filter(Boolean).join(", ");

  const badges = [buildingType, renovation, floor, balconies].filter(Boolean);

  // ── Colours & design tokens ──
  const PRIMARY = "#22c55e";
  const PRIMARY_LIGHT = "#dcfce7";
  const BG = "#f3f4f6";
  const CARD = "#ffffff";
  const TEXT_DARK = "#111827";
  const TEXT_MID = "#6b7280";
  const TEXT_LIGHT = "#9ca3af";

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        {/* Card */}
        <div
          style={{
            width: 1080,
            background: CARD,
            borderRadius: 28,
            padding: "56px 64px 52px",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 4px 40px rgba(0,0,0,0.08)",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 36,
            }}
          >
            {/* Icon + label */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: PRIMARY_LIGHT,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width={28}
                  height={28}
                  fill="none"
                  stroke={PRIMARY}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
                  <path d="M9 21V12h6v9" />
                </svg>
              </div>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: TEXT_MID,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Analiza Pieții
              </span>
            </div>

            {/* Branding */}
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: PRIMARY,
                letterSpacing: "-0.01em",
              }}
            >
              catdai.md
            </span>
          </div>

          {/* Main title */}
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: TEXT_DARK,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              marginBottom: 16,
            }}
          >
            {title}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <div
              style={{
                fontSize: 28,
                color: TEXT_MID,
                marginBottom: 40,
                fontWeight: 400,
              }}
            >
              {subtitle}
            </div>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {badges.map((badge) => (
                <div
                  key={badge}
                  style={{
                    background: "#f3f4f6",
                    borderRadius: 12,
                    padding: "12px 20px",
                    fontSize: 22,
                    fontWeight: 500,
                    color: "#374151",
                  }}
                >
                  {badge}
                </div>
              ))}
            </div>
          )}

          {/* Bottom rule + tagline */}
          <div
            style={{
              marginTop: "auto",
              paddingTop: 36,
              borderTop: "1px solid #f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 18, color: TEXT_LIGHT }}>
              Estimare bazată pe anunțuri reale din piață
            </span>
            <span
              style={{
                fontSize: 18,
                color: TEXT_LIGHT,
              }}
            >
              catdai.md
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

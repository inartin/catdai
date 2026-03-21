import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// ── Label maps (Romanian) ──

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

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin
    .from("shared_links")
    .select("params")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) {
    return { title: "Link inexistent — Catdai" };
  }

  const p = data.params || {};
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
    ? `Apartament ${titleParts.join(" · ")} — ${[district, city].filter(Boolean).join(", ")} | Catdai`
    : "Evaluare apartament | Catdai";

  const details = [buildingType, renovation, floor, balconies].filter(Boolean);
  const description = `Analiza Pieții: ${roomsLabel}${area ? `, ${area}m²` : ""} în ${[district, city].filter(Boolean).join(", ")}.${details.length ? ` ${details.join(" · ")}.` : ""} Preț estimat, comparație pe sectoare și statistici de piață.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Catdai",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function SharedLinkPage({ params }) {
  const { slug } = await params;

  const { data, error } = await supabaseAdmin
    .from("shared_links")
    .select("params, sharer_is_paid")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(data.params || {})) {
    if (value != null && value !== "") {
      sp.set(key, String(value));
    }
  }
  sp.set("share_slug", slug);

  const evaluareUrl = `/evaluare?${sp.toString()}`;

  // Render a real HTML page so Next.js includes the OG meta tags in the
  // response body. Social-media crawlers read those tags without executing JS.
  // Real users are forwarded instantly by the inline script; the <meta> refresh
  // handles JS-disabled environments.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=${evaluareUrl}`} />
      </noscript>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace(${JSON.stringify(evaluareUrl)})`,
        }}
      />
    </>
  );
}


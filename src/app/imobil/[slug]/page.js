import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { serializeJsonLd, toAbsoluteUrl } from "@/lib/seo";

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

function buildListingSeo(params = {}, slug = "") {
  const city = params.city || "Chișinău";
  const district = params.district || "";
  const rooms = params.rooms || "";
  const area = params.area || "";
  const buildingType =
    BUILDING_TYPE[params.building_type] || params.building_type || "";
  const renovation = RENOVATION[params.renovation] || params.renovation || "";
  const floor = floorLabel(params.floor, params.total_floors);
  const balconies = (() => {
    const b = params.balconies;
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
  const description = `Analiza Pieței: ${roomsLabel}${area ? `, ${area}m²` : ""} în ${[district, city].filter(Boolean).join(", ")}.${details.length ? ` ${details.join(" · ")}.` : ""} Preț estimat, comparație pe sectoare și statistici de piață.`;
  const canonicalPath = `/imobil/${slug}`;
  const canonicalUrl = toAbsoluteUrl(canonicalPath);

  return { title, description, canonicalPath, canonicalUrl };
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
  const seo = buildListingSeo(data.params || {}, slug);

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: seo.canonicalPath,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      type: "article",
      siteName: "Catdai",
      url: seo.canonicalUrl,
    },
    twitter: {
      card: "summary",
      title: seo.title,
      description: seo.description,
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
  const seo = buildListingSeo(data.params || {}, slug);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Acasă",
        item: toAbsoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: seo.title,
        item: seo.canonicalUrl,
      },
    ],
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: seo.title,
    description: seo.description,
    url: seo.canonicalUrl,
    inLanguage: "ro",
  };

  // Render a real HTML page so Next.js includes the OG meta tags in the
  // response body. Social-media crawlers read those tags without executing JS.
  // Real users are forwarded instantly by the inline script; the <meta> refresh
  // handles JS-disabled environments.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(webPageJsonLd) }}
      />
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

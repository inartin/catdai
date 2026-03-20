import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

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
  const city = p.city || "";
  const district = p.district || "";
  const rooms = p.rooms || "";
  const area = p.area || "";

  const title = `Evaluare ${rooms} camere, ${area}m² — ${district}, ${city} | Catdai`;
  const description = `Analiză imobiliară: apartament ${rooms} camere, ${area}m² în ${district}, ${city}. Preț estimat, comparație pe sectoare și statistici de piață.`;

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
      card: "summary_large_image",
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


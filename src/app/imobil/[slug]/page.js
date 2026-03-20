import { redirect, notFound } from "next/navigation";
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

  const searchParams = new URLSearchParams();
  const storedParams = data.params || {};

  for (const [key, value] of Object.entries(storedParams)) {
    if (value != null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  // Pass the slug so the estimate API can verify server-side
  searchParams.set("share_slug", slug);

  redirect(`/evaluare?${searchParams.toString()}`);
}

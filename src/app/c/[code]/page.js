import { notFound } from "next/navigation";
import CadastruResultPage from "@/app/cadastru/rezultat/page";
import { decodeCadastruShareCode } from "@/lib/cadastru-share-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function SharedCadastruPage({ params }) {
  const { code } = await params;
  let shareSlug = decodeCadastruShareCode(code);
  if (!shareSlug) {
    if (!/^[A-Za-z0-9_-]{12}$/.test(code)) notFound();
    const { data, error } = await supabaseAdmin.from("cadastru_shared_reports")
      .select("slug").eq("short_code", code).maybeSingle();
    if (error) throw new Error("Shared report storage unavailable");
    if (!data) notFound();
    shareSlug = data.slug;
  }
  return <CadastruResultPage shareSlug={shareSlug} />;
}

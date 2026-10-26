import { notFound } from "next/navigation";
import CadastruResultPage from "@/app/cadastru/rezultat/page";
import { decodeCadastruShareCode } from "@/lib/cadastru-share-url";

export default async function SharedCadastruPage({ params }) {
  const { code } = await params;
  const shareSlug = decodeCadastruShareCode(code);
  if (!shareSlug) notFound();
  return <CadastruResultPage shareSlug={shareSlug} />;
}

import { notFound } from "next/navigation";
import CadastruResultPage from "@/app/cadastru/rezultat/CadastruResultPage";
import { getCadastruSharedReport, getCadastruShareMetadata } from "@/lib/cadastru-share-metadata";

export async function generateMetadata({ params }) {
  const { code } = await params;
  return getCadastruShareMetadata(await getCadastruSharedReport(code));
}

export default async function SharedCadastruPage({ params }) {
  const { code } = await params;
  const report = await getCadastruSharedReport(code);
  if (!report) notFound();
  return <CadastruResultPage shareSlug={report.slug} />;
}

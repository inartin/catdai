import CadastruResultPage from "./CadastruResultPage";
import { getCadastruSharedReport, getCadastruShareMetadata } from "@/lib/cadastru-share-metadata";

export async function generateMetadata({ searchParams }) {
  const { share_slug: shareSlug } = await searchParams;
  if (!shareSlug) return {};
  return getCadastruShareMetadata(await getCadastruSharedReport(shareSlug));
}

export default function CadastruResultRoute() {
  return <CadastruResultPage />;
}

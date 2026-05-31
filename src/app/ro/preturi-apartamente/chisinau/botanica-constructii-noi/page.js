import StaticMarketAnalysisPage from "@/components/StaticMarketAnalysisPage";
import data from "@/data/static-market-analysis/botanica-chisinau-2rooms-50m2-new-2026-05-31.json";

const canonicalPath = "/ro/preturi-apartamente/chisinau/botanica-constructii-noi";
const ruPath = "/ru/ceny-kvartir/kishinev/botanika-novostroy";
const oldBuildingPath = "/ro/preturi-apartamente/chisinau/botanica";

export const metadata = {
  title: "Prețuri apartamente blocuri noi Botanica, Chișinău | Catdai",
  description:
    "Preț orientativ pentru un apartament cu 2 camere, 50 m², într-un bloc nou cu euroreparație în Botanica, Chișinău. Estimare: €115 700.",
  alternates: {
    canonical: canonicalPath,
    languages: {
      ro: canonicalPath,
      ru: ruPath,
      "x-default": canonicalPath,
    },
  },
  openGraph: {
    title: "Prețuri apartamente blocuri noi Botanica, Chișinău | Catdai",
    description:
      "Estimare pentru un apartament cu 2 camere într-un bloc nou din Botanica: €115 700 și €2 314/m².",
    url: canonicalPath,
    type: "article",
    locale: "ro_MD",
  },
};

export default function BotanicaNewApartmentPricesPage() {
  return (
    <StaticMarketAnalysisPage
      lang="ro"
      data={data}
      canonicalPath={canonicalPath}
      alternatePath={ruPath}
      comparisonPath={oldBuildingPath}
      pageType="new"
    />
  );
}

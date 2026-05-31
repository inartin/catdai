import StaticMarketAnalysisPage from "@/components/StaticMarketAnalysisPage";
import data from "@/data/static-market-analysis/botanica-chisinau-2rooms-50m2-2026-05-31.json";

const canonicalPath = "/ro/preturi-apartamente/chisinau/botanica";
const ruPath = "/ru/ceny-kvartir/kishinev/botanika";
const newBuildingPath = "/ro/preturi-apartamente/chisinau/botanica-constructii-noi";

export const metadata = {
  title: "Prețuri apartamente Botanica, Chișinău | Catdai",
  description:
    "Preț orientativ pentru un apartament cu 2 camere, 50 m², într-un bloc vechi cu euroreparație în Botanica, Chișinău. Estimare: €98 900.",
  alternates: {
    canonical: canonicalPath,
    languages: {
      ro: canonicalPath,
      ru: ruPath,
      "x-default": canonicalPath,
    },
  },
  openGraph: {
    title: "Prețuri apartamente Botanica, Chișinău | Catdai",
    description:
      "Estimare pentru un apartament cu 2 camere în Botanica: €98 900 și €1 978/m².",
    url: canonicalPath,
    type: "article",
    locale: "ro_MD",
  },
};

export default function BotanicaApartmentPricesPage() {
  return (
    <StaticMarketAnalysisPage
      lang="ro"
      data={data}
      canonicalPath={canonicalPath}
      alternatePath={ruPath}
      comparisonPath={newBuildingPath}
      pageType="secondary"
    />
  );
}

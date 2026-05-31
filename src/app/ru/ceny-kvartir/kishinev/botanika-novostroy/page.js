import StaticMarketAnalysisPage from "@/components/StaticMarketAnalysisPage";
import data from "@/data/static-market-analysis/botanica-chisinau-2rooms-50m2-new-2026-05-31.json";

const canonicalPath = "/ru/ceny-kvartir/kishinev/botanika-novostroy";
const roPath = "/ro/preturi-apartamente/chisinau/botanica-constructii-noi";
const oldBuildingPath = "/ru/ceny-kvartir/kishinev/botanika";

export const metadata = {
  title: "Цены на квартиры в новостройках Ботаники, Кишинев | Catdai",
  description:
    "Ориентировочная цена 2-комнатной квартиры 50 м² в новом доме с евроремонтом в Ботанике, Кишинев. Оценка: €115 700.",
  alternates: {
    canonical: canonicalPath,
    languages: {
      ro: roPath,
      ru: canonicalPath,
      "x-default": roPath,
    },
  },
  openGraph: {
    title: "Цены на квартиры в новостройках Ботаники, Кишинев | Catdai",
    description:
      "Оценка для 2-комнатной квартиры в новостройке в Ботанике: €115 700 и €2 314/м².",
    url: canonicalPath,
    type: "article",
    locale: "ru_MD",
  },
};

export default function BotanikaNewApartmentPricesPage() {
  return (
    <StaticMarketAnalysisPage
      lang="ru"
      data={data}
      canonicalPath={canonicalPath}
      alternatePath={roPath}
      comparisonPath={oldBuildingPath}
      pageType="new"
    />
  );
}

import StaticMarketAnalysisPage from "@/components/StaticMarketAnalysisPage";
import data from "@/data/static-market-analysis/botanica-chisinau-2rooms-50m2-2026-05-31.json";

const canonicalPath = "/ru/ceny-kvartir/kishinev/botanika";
const roPath = "/ro/preturi-apartamente/chisinau/botanica";
const newBuildingPath = "/ru/ceny-kvartir/kishinev/botanika-novostroy";

export const metadata = {
  title: "Цены на квартиры в Ботанике, Кишинев | Catdai",
  description:
    "Ориентировочная цена 2-комнатной квартиры 50 м² во вторичном фонде с евроремонтом в Ботанике, Кишинев. Оценка: €98 900.",
  alternates: {
    canonical: canonicalPath,
    languages: {
      ro: roPath,
      ru: canonicalPath,
      "x-default": roPath,
    },
  },
  openGraph: {
    title: "Цены на квартиры в Ботанике, Кишинев | Catdai",
    description:
      "Оценка для 2-комнатной квартиры в Ботанике: €98 900 и €1 978/м².",
    url: canonicalPath,
    type: "article",
    locale: "ru_MD",
  },
};

export default function BotanikaApartmentPricesPage() {
  return (
    <StaticMarketAnalysisPage
      lang="ru"
      data={data}
      canonicalPath={canonicalPath}
      alternatePath={roPath}
      comparisonPath={newBuildingPath}
      pageType="secondary"
    />
  );
}

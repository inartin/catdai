import Link from "next/link";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { serializeJsonLd, toAbsoluteUrl } from "@/lib/seo";

const LABELS = {
  ro: {
    apartment: "Apartament cu 2 camere",
    analyzedProfile: "Profil analizat",
    snapshot: "Actualizat",
    snapshotDate: "31 mai 2026",
    title: "Prețuri apartamente Botanica, Chișinău",
    subtitle:
      "Analiză de piață la data de 31 mai 2026 pentru un apartament cu 2 camere, 50 m², euroreparație, într-un bloc vechi din sectorul Botanica.",
    lead:
      "Pentru acest tip de apartament, prețul orientativ este €98 900, adică aproximativ €1 978/m². Calculul folosește anunțuri similare din Botanica și arată unde se află prețul în piață.",
    cta: "Calculează pentru apartamentul tău",
    estimatorHref:
      "/ro/estimeaza?city=Chi%C8%99in%C4%83u&district=Botanica&rooms=2&area=50&building_type=Secundar&renovation=Eurorepara%C8%9Bie",
    city: "Chișinău",
    district: "Botanica",
    buildingType: "Secundar",
    renovation: "Euroreparație",
    estimatedPrice: "Preț estimat",
    pricePerM2: "Preț pe m²",
    fastSale: "Vânzare rapidă",
    marketPrice: "Preț de piață",
    targetPrice: "Preț țintă",
    marketPosition: "Poziționare în piață",
    marketPositionDesc:
      "Indicatorul arată unde se află estimarea față de intervalul observat în segmentul analizat.",
    howAnalyzed: "Cum a fost calculată analiza",
    howAnalyzedDesc:
      "Am comparat apartamente similare după oraș, sector, număr de camere, suprafață, tipul construcției și starea reparației.",
    comparableSegment: "Preț tipic pentru acest segment",
    sellerBreakdown: "Diferență după tipul vânzătorului",
    sellerBreakdownDesc:
      "Pentru acest profil, anunțurile agențiilor și dezvoltatorilor sunt, în medie, mai sus decât anunțurile persoanelor fizice.",
    privateSeller: "Persoane fizice",
    agencySeller: "Agenții / dezvoltatori",
    sellerDifference: "Diferență",
    districtComparison: "Comparație pe sectoare",
    districtComparisonDesc:
      "Prețul tipic pe m² pentru apartamente comparabile din Chișinău, pe același tip de construcție și reparație.",
    marketStats: "Statistici de piață",
    avgPricePerM2: "Preț obișnuit /m²",
    medianPricePerM2: "Preț folosit în estimare",
    avgTotalPrice: "Preț total obișnuit",
    comparableListings: "Comparabile",
    trendTitle: "Tendință Botanica",
    trendDesc:
      "Prețul tipic pe m² pentru apartamente secundare din Botanica a scăzut cu 1,2% în perioada 1-29 mai 2026.",
    trendPeriod: "1-29 mai 2026",
    faqTitle: "Ce înseamnă această estimare?",
    faqBody:
      "Rezultatul este orientativ. Pentru un apartament concret, prețul poate fi influențat de etaj, bloc, starea reală, acte, zonă exactă și cât de repede vrei să vinzi.",
    seoFooter:
      "Această pagină ajută la înțelegerea prețurilor pentru apartamente cu 2 camere în Botanica, Chișinău, fără a înlocui o evaluare oficială.",
  },
  ru: {
    apartment: "2-комнатная квартира",
    analyzedProfile: "Проанализированный профиль",
    snapshot: "Обновлено",
    snapshotDate: "31 мая 2026",
    title: "Цены на квартиры в Ботанике, Кишинев",
    subtitle:
      "Анализ рынка на 31 мая 2026 года для 2-комнатной квартиры 50 м² с евроремонтом в старом доме в секторе Ботаника.",
    lead:
      "Для такого типа квартиры ориентировочная цена составляет €98 900, или примерно €1 978/м². Расчет основан на похожих объявлениях в Ботанике и показывает уровень цены на рынке.",
    cta: "Рассчитать для своей квартиры",
    estimatorHref:
      "/ru/estimeaza?city=Chi%C8%99in%C4%83u&district=Botanica&rooms=2&area=50&building_type=Secundar&renovation=Eurorepara%C8%9Bie",
    city: "Кишинев",
    district: "Ботаника",
    buildingType: "Вторичка",
    renovation: "Евроремонт",
    estimatedPrice: "Оценочная цена",
    pricePerM2: "Цена за м²",
    fastSale: "Быстрая продажа",
    marketPrice: "Рыночная цена",
    targetPrice: "Целевая цена",
    marketPosition: "Позиция на рынке",
    marketPositionDesc:
      "Индикатор показывает, где находится оценка относительно диапазона цен в выбранном сегменте.",
    howAnalyzed: "Как рассчитан анализ",
    howAnalyzedDesc:
      "Мы сравнили похожие квартиры по городу, сектору, количеству комнат, площади, типу дома и состоянию ремонта.",
    comparableSegment: "Типичная цена для этого сегмента",
    sellerBreakdown: "Разница по типу продавца",
    sellerBreakdownDesc:
      "Для этого профиля объявления агентств и застройщиков в среднем выше, чем объявления частных лиц.",
    privateSeller: "Частные лица",
    agencySeller: "Агентства / застройщики",
    sellerDifference: "Разница",
    districtComparison: "Сравнение по секторам",
    districtComparisonDesc:
      "Типичная цена за м² для похожих квартир в Кишиневе с тем же типом дома и ремонтом.",
    marketStats: "Рыночная статистика",
    avgPricePerM2: "Обычная цена /м²",
    medianPricePerM2: "Цена в расчете",
    avgTotalPrice: "Обычная общая цена",
    comparableListings: "Сопоставимые объявления",
    trendTitle: "Тренд в Ботанике",
    trendDesc:
      "Типичная цена за м² для квартир вторичного фонда в Ботанике снизилась на 1,2% за период 1-29 мая 2026 года.",
    trendPeriod: "1-29 мая 2026",
    faqTitle: "Что означает эта оценка?",
    faqBody:
      "Результат ориентировочный. Для конкретной квартиры итоговая цена может зависеть от этажа, дома, реального состояния, документов, точной локации и срочности продажи.",
    seoFooter:
      "Эта страница помогает понять цены на 2-комнатные квартиры в Ботанике, Кишинев, но не заменяет официальную оценку.",
  },
};

const PAGE_LABELS = {
  secondary: {
    ro: {
      title: "Prețuri apartamente Botanica, Chișinău",
      subtitle:
        "Analiză de piață la data de 31 mai 2026 pentru un apartament cu 2 camere, 50 m², euroreparație, într-un bloc vechi din sectorul Botanica.",
      lead:
        "Pentru acest tip de apartament, prețul orientativ este €98 900, adică aproximativ €1 978/m². Calculul folosește anunțuri similare din Botanica și arată unde se află prețul în piață.",
      estimatorHref:
        "/ro/estimeaza?city=Chi%C8%99in%C4%83u&district=Botanica&rooms=2&area=50&building_type=Secundar&renovation=Eurorepara%C8%9Bie",
      buildingType: "Bloc vechi",
      trendDesc:
        "Prețul tipic pe m² pentru apartamente în blocuri vechi din Botanica a scăzut cu 1,2% în perioada 1-29 mai 2026.",
      seoFooter:
        "Această pagină ajută la înțelegerea prețurilor pentru apartamente cu 2 camere în blocuri vechi din Botanica, Chișinău, fără a înlocui o evaluare oficială.",
      comparisonCta: "Compară cu bloc nou",
      comparisonTitle: "Bloc vechi vs bloc nou",
      comparisonText:
        "Vezi cum se schimbă estimarea pentru aceiași parametri, dar într-o construcție nouă din Botanica.",
    },
    ru: {
      title: "Цены на квартиры в Ботанике, Кишинев",
      subtitle:
        "Анализ рынка на 31 мая 2026 года для 2-комнатной квартиры 50 м² с евроремонтом в старом доме в секторе Ботаника.",
      lead:
        "Для такого типа квартиры ориентировочная цена составляет €98 900, или примерно €1 978/м². Расчет основан на похожих объявлениях в Ботанике и показывает уровень цены на рынке.",
      estimatorHref:
        "/ru/estimeaza?city=Chi%C8%99in%C4%83u&district=Botanica&rooms=2&area=50&building_type=Secundar&renovation=Eurorepara%C8%9Bie",
      buildingType: "Старый дом",
      trendDesc:
        "Типичная цена за м² для квартир в старых домах в Ботанике снизилась на 1,2% за период 1-29 мая 2026 года.",
      seoFooter:
        "Эта страница помогает понять цены на 2-комнатные квартиры в старых домах в Ботанике, Кишинев, но не заменяет официальную оценку.",
      comparisonCta: "Сравнить с новостроем",
      comparisonTitle: "Старый дом vs новострой",
      comparisonText:
        "Посмотрите, как меняется оценка для тех же параметров, но в новом доме в Ботанике.",
    },
  },
  new: {
    ro: {
      title: "Prețuri apartamente în blocuri noi Botanica, Chișinău",
      subtitle:
        "Analiză de piață la data de 31 mai 2026 pentru un apartament cu 2 camere, 50 m², euroreparație, într-un bloc nou din sectorul Botanica.",
      lead:
        "Pentru acest tip de apartament, prețul orientativ este €115 700, adică aproximativ €2 314/m². Calculul folosește anunțuri similare din blocuri noi din Botanica și arată unde se află prețul în piață.",
      estimatorHref:
        "/ro/estimeaza?city=Chi%C8%99in%C4%83u&district=Botanica&rooms=2&area=50&building_type=Construc%C5%A3ii%20noi&renovation=Eurorepara%C8%9Bie",
      buildingType: "Bloc nou",
      trendDesc:
        "Prețul tipic pe m² pentru apartamente în blocuri noi din Botanica a crescut cu 1,4% în perioada 1-29 mai 2026.",
      seoFooter:
        "Această pagină ajută la înțelegerea prețurilor pentru apartamente cu 2 camere în blocuri noi din Botanica, Chișinău, fără a înlocui o evaluare oficială.",
      comparisonCta: "Compară cu bloc vechi",
      comparisonTitle: "Bloc nou vs bloc vechi",
      comparisonText:
        "Vezi cum se schimbă estimarea pentru aceiași parametri, dar într-un bloc vechi din Botanica.",
    },
    ru: {
      title: "Цены на квартиры в новостройках Ботаники, Кишинев",
      subtitle:
        "Анализ рынка на 31 мая 2026 года для 2-комнатной квартиры 50 м² с евроремонтом в новом доме в секторе Ботаника.",
      lead:
        "Для такого типа квартиры ориентировочная цена составляет €115 700, или примерно €2 314/м². Расчет основан на похожих объявлениях в новостройках Ботаники и показывает уровень цены на рынке.",
      estimatorHref:
        "/ru/estimeaza?city=Chi%C8%99in%C4%83u&district=Botanica&rooms=2&area=50&building_type=Construc%C5%A3ii%20noi&renovation=Eurorepara%C8%9Bie",
      buildingType: "Новострой",
      trendDesc:
        "Типичная цена за м² для квартир в новостройках Ботаники выросла на 1,4% за период 1-29 мая 2026 года.",
      seoFooter:
        "Эта страница помогает понять цены на 2-комнатные квартиры в новостройках Ботаники, Кишинев, но не заменяет официальную оценку.",
      comparisonCta: "Сравнить со старым домом",
      comparisonTitle: "Новострой vs старый дом",
      comparisonText:
        "Посмотрите, как меняется оценка для тех же параметров, но в старом доме в Ботанике.",
    },
  },
};

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `€${Math.round(number).toLocaleString("ro-MD")}`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return Math.round(number).toLocaleString("ro-MD");
}

function TrendChart({ trend }) {
  const points = Array.isArray(trend?.points) ? trend.points : [];
  const values = points.map((point) => Number(point.value)).filter(Number.isFinite);
  if (points.length < 2 || values.length < 2) return null;

  const width = 560;
  const height = 150;
  const padding = 14;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points
    .map((point, index) => {
      const value = Number(point.value);
      const x = padding + (index / (points.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-6 h-36 w-full text-primary" role="img" aria-hidden="true">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.12" />
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ label, value, note, tone = "text-gray-900" }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

function FilterBadge({ children }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
      {children}
    </span>
  );
}

export default function StaticMarketAnalysisPage({
  lang,
  data,
  canonicalPath,
  alternatePath,
  comparisonPath,
  pageType = "secondary",
}) {
  const labels = {
    ...(LABELS[lang] || LABELS.ro),
    ...(PAGE_LABELS[pageType]?.[lang] || PAGE_LABELS.secondary.ro),
  };
  const estimate = data.estimate;
  const stats = data.market_stats;
  const range = data.range;
  const trend = data.market_trend;
  const markerPct = Math.max(2, Math.min(98, Number(data.market_position?.marker_pct) || 50));
  const individual = data.estimates_by_seller?.individual;
  const agency = data.estimates_by_seller?.agency;
  const sellerDelta = agency?.estimate?.market_rate - individual?.estimate?.market_rate;
  const sellerDeltaPct = (sellerDelta / individual?.estimate?.market_rate) * 100;
  const maxDistrictValue = Math.max(...data.district_comparison.map((item) => item.median_ppm));
  const trendChange = Number(trend.change_pct);
  const trendToneClass = trendChange >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600";
  const trendValue = Number.isFinite(trendChange)
    ? `${trendChange > 0 ? "+" : ""}${trendChange}%`
    : "—";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Catdai",
        item: toAbsoluteUrl(lang === "ru" ? "/ru" : "/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: labels.title,
        item: toAbsoluteUrl(canonicalPath),
      },
    ],
  };

  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: labels.title,
    description: labels.subtitle,
    url: toAbsoluteUrl(canonicalPath),
    inLanguage: lang,
    datePublished: data.snapshot_date,
    dateModified: data.snapshot_date,
    isPartOf: {
      "@type": "WebSite",
      name: "Catdai",
      url: toAbsoluteUrl("/"),
    },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(webPageJsonLd) }}
      />
      <Navbar />
      <main>
        <section className="border-b border-gray-100 bg-white px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary ring-1 ring-emerald-100">
                {labels.snapshot}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                {labels.snapshotDate}
              </span>
            </div>
            <h1 className="mt-5 max-w-4xl text-4xl font-extrabold leading-tight tracking-tight text-gray-950 sm:text-5xl">
              {labels.title}
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-gray-600">
              {labels.subtitle}
            </p>
            <p className="mt-5 max-w-3xl text-base leading-7 text-gray-500">
              {labels.lead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={labels.estimatorHref}
                className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-700/15 transition-colors hover:bg-primary-dark"
              >
                {labels.cta}
              </Link>
              <Link
                href={alternatePath}
                hrefLang={lang === "ru" ? "ro" : "ru"}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50"
              >
                {lang === "ru" ? "Română" : "Русский"}
              </Link>
              {comparisonPath && (
                <Link
                  href={comparisonPath}
                  className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-sm font-bold text-primary transition-colors hover:bg-emerald-100"
                >
                  {labels.comparisonCta}
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="px-4 py-10">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-gray-400">
                    {labels.analyzedProfile}
                  </p>
                  <h2 className="mt-3 text-2xl font-bold text-gray-950">
                    {labels.apartment} · 50 m²
                  </h2>
                  <p className="mt-1 text-base text-gray-500">
                    {labels.district}, {labels.city}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <FilterBadge>{labels.buildingType}</FilterBadge>
                    <FilterBadge>{labels.renovation}</FilterBadge>
                    <FilterBadge>40-60 m²</FilterBadge>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-5 py-4 lg:min-w-72">
                  <p className="text-sm font-semibold text-gray-500">{labels.trendTitle}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-950">
                    {formatPrice(trend.end_value)}/m²
                    <span className={`ml-2 rounded-lg px-2 py-1 text-sm font-bold ${trendToneClass}`}>
                      {trendValue}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{labels.trendPeriod}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 p-6 text-center sm:p-8">
                <p className="text-base text-gray-400">{labels.estimatedPrice}</p>
                <p className="mt-2 text-6xl font-bold tracking-tight text-gray-950">
                  {formatPrice(estimate.market_rate)}
                </p>
                <p className="mt-2 text-base text-gray-500">
                  {formatPrice(estimate.price_per_m2)}/m²
                </p>
              </div>
              <div className="grid divide-y divide-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-5 text-center sm:p-6">
                  <p className="text-sm text-gray-400">{labels.fastSale}</p>
                  <p className="mt-2 text-xl font-bold text-emerald-600">{formatPrice(estimate.fast_sale)}</p>
                  <p className="mt-1 text-xs text-gray-400">-10%</p>
                </div>
                <div className="bg-primary/5 p-5 text-center sm:p-6">
                  <p className="text-sm text-gray-400">{labels.marketPrice}</p>
                  <p className="mt-2 text-xl font-bold text-primary">{formatPrice(estimate.market_rate)}</p>
                </div>
                <div className="p-5 text-center sm:p-6">
                  <p className="text-sm text-gray-400">{labels.targetPrice}</p>
                  <p className="mt-2 text-xl font-bold text-amber-600">{formatPrice(estimate.premium)}</p>
                  <p className="mt-1 text-xs text-gray-400">+8%</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
              <div className="flex flex-col gap-6">
                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-lg font-bold text-gray-950">{labels.howAnalyzed}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{labels.howAnalyzedDesc}</p>
                  <div className="mt-5 rounded-xl bg-gray-50 p-5 text-center">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                      {labels.comparableSegment}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-primary">
                      {formatPrice(stats.median_price_per_m2)}/m²
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      × 50 m² = {formatPrice(estimate.market_rate)}
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-lg font-bold text-gray-950">{labels.marketPosition}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{labels.marketPositionDesc}</p>
                  <div className="relative mt-8 pb-1 pt-6">
                    <div className="absolute top-2 -translate-x-1/2" style={{ left: `${markerPct}%` }}>
                      <div className="h-0 w-0 border-l-[9px] border-r-[9px] border-t-[9px] border-l-transparent border-r-transparent border-t-primary" />
                    </div>
                    <div className="relative h-3 overflow-hidden rounded-full bg-gray-100">
                      <div className="absolute inset-y-0 rounded-full bg-linear-to-r from-emerald-200 via-primary/30 to-amber-200" style={{ left: "10%", right: "10%" }} />
                    </div>
                    <div className="mt-3 flex justify-between text-xs text-gray-400">
                      <span>{formatPrice(range.low)}</span>
                      <span className="text-sm font-medium text-gray-500">{formatPrice(stats.median_price_per_m2)}/m²</span>
                      <span>{formatPrice(range.high)}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <div className="border-b border-gray-100 bg-gray-50/60 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-gray-950">{labels.sellerBreakdown}</h2>
                        <p className="mt-1 text-sm text-gray-500">{labels.sellerBreakdownDesc}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-amber-600 shadow-sm">
                        {labels.sellerDifference}: +{formatPrice(Math.abs(sellerDelta)).replace("€", "€")}
                        {" "}({sellerDeltaPct.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                  <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    <div className="p-5 text-center">
                      <p className="text-sm font-medium text-gray-500">{labels.privateSeller}</p>
                      <p className="mt-2 text-2xl font-bold text-gray-950">{formatPrice(individual.estimate.market_rate)}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatPrice(individual.estimate.price_per_m2)}/m² · {individual.market_stats.comparable_count}</p>
                    </div>
                    <div className="p-5 text-center">
                      <p className="text-sm font-medium text-gray-500">{labels.agencySeller}</p>
                      <p className="mt-2 text-2xl font-bold text-gray-950">{formatPrice(agency.estimate.market_rate)}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatPrice(agency.estimate.price_per_m2)}/m² · {agency.market_stats.comparable_count}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
                  <h2 className="text-lg font-bold text-gray-950">{labels.districtComparison}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{labels.districtComparisonDesc}</p>
                  <div className="mt-6 space-y-3">
                    {data.district_comparison.map((district) => {
                      const width = Math.max(8, (district.median_ppm / maxDistrictValue) * 100);
                      const isCurrent = district.district === data.input.district;
                      return (
                        <div key={district.district}>
                          <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                            <span className={isCurrent ? "font-bold text-primary" : "font-medium text-gray-700"}>
                              {district.district}
                            </span>
                            <span className="font-bold text-gray-950">{formatPrice(district.median_ppm)}/m²</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${isCurrent ? "bg-primary" : "bg-gray-300"}`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              <aside className="flex flex-col gap-6">
                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-950">{labels.marketStats}</h2>
                  <div className="mt-5 grid gap-3">
                    <MetricCard label={labels.comparableListings} value={formatNumber(stats.comparable_count)} />
                    <MetricCard label={labels.avgPricePerM2} value={`${formatPrice(stats.avg_price_per_m2)}/m²`} />
                    <MetricCard label={labels.medianPricePerM2} value={`${formatPrice(stats.median_price_per_m2)}/m²`} />
                    <MetricCard label={labels.avgTotalPrice} value={formatPrice(stats.avg_price)} />
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-bold text-gray-950">{labels.trendTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-500">{labels.trendDesc}</p>
                  <TrendChart trend={trend} />
                </section>

                {comparisonPath && (
                  <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6">
                    <h2 className="text-lg font-bold text-emerald-950">{labels.comparisonTitle}</h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-800">{labels.comparisonText}</p>
                    <Link
                      href={comparisonPath}
                      className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/15 transition-colors hover:bg-primary-dark"
                    >
                      {labels.comparisonCta}
                    </Link>
                  </section>
                )}

                <section className="rounded-2xl border border-sky-100 bg-sky-50 p-6">
                  <h2 className="text-lg font-bold text-sky-950">{labels.faqTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-sky-800">{labels.faqBody}</p>
                </section>

             
              </aside>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              <p className="max-w-4xl text-base leading-7 text-gray-600">
                {labels.seoFooter}
              </p>
              <div className="mt-6">
                <Link
                  href={labels.estimatorHref}
                  className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-4 text-sm font-extrabold text-white shadow-lg shadow-emerald-700/15 transition-colors hover:bg-primary-dark"
                >
                  {labels.cta}
                </Link>
              </div>
            </section>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

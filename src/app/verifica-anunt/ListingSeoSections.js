import { DuplicateCheckIcon, PriceAnalysisIcon, PriceHistoryIcon } from "@/components/icons/AnalyzerFeatureIcons";

function ExampleCard({ copy, children }) {
  return (
    <figure className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      {children}
      <figcaption className="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500">{copy.example}</figcaption>
    </figure>
  );
}

function HistoryExample({ copy }) {
  const c = copy.history;
  const points = [[48, 39], [82, 49], [106, 65], [132, 98], [232, 118], [266, 122], [310, 135], [350, 154], [388, 164], [416, 168]];
  return (
    <ExampleCard copy={copy}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.label}</p>
          <p className="mt-1 text-xs text-gray-500">{c.dates[0]} - {c.dates[2]}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-500">{c.latest}</p>
          <p className="text-xl font-bold tracking-tight text-gray-900">€89.900</p>
          <p className="mt-1 text-sm font-semibold text-emerald-600">−€19.100 (−17,5%)</p>
          <p className="text-xs text-gray-500">{c.initial}</p>
        </div>
      </div>
      <svg viewBox="0 0 440 216" role="img" aria-label={c.chart} className="mt-5 w-full">
        {[24, 77, 130, 183].map((y, i) => (
          <g key={y}>
            <line x1="48" y1={y} x2="416" y2={y} stroke="#e5e7eb" />
            <text x="38" y={y + 4} textAnchor="end" fill="#6b7280" fontSize="11">{["€111k", "€103k", "€95k", "€88k"][i]}</text>
          </g>
        ))}
        <path d="M48 24V183H416" fill="none" stroke="#cbd5e1" />
        <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map(([x, y], i) => <circle key={x} cx={x} cy={y} r="4.5" fill="white" stroke={i === 0 ? "#0ea5e9" : "#059669"} strokeWidth="1.8" />)}
        {c.dates.map((date, i) => <text key={date} x={[48, 240, 416][i]} y="208" textAnchor={["start", "middle", "end"][i]} fill="#6b7280" fontSize="10">{date}</text>)}
      </svg>
    </ExampleCard>
  );
}

function MarketExample({ copy }) {
  const c = copy.market;
  return (
    <ExampleCard copy={copy}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{c.label}</p>
      <p className="mt-2 text-sm text-gray-600">{c.property}</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gray-50 p-3 sm:p-4">
          <p className="text-xs text-gray-500">{c.estimate}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">€90.000</p>
          <p className="mt-1 text-xs text-gray-500">€1.500 / m²</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 sm:p-4">
          <p className="text-xs text-gray-600">{c.asking}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">€99.000</p>
          <p className="mt-1 text-xs text-gray-500">€1.650 / m²</p>
        </div>
      </div>
      <div className="mt-5 space-y-2" aria-hidden="true">
        <div className="h-2 w-[90%] rounded-full bg-primary/70" />
        <div className="h-2 w-full rounded-full bg-amber-400" />
      </div>
      <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">↗ {c.verdict}</p>
        <p className="mt-1 text-xs leading-5 text-amber-800">{c.difference}</p>
      </div>
    </ExampleCard>
  );
}

function DuplicatesExample({ copy }) {
  const c = copy.duplicates;
  return (
    <ExampleCard copy={copy}>
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">{c.label}</p>
      <div className="space-y-3">
        {c.listings.map((label, i) => (
          <div key={label} className="rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{c.match}</span>
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">{c.property}</p>
              <p className="text-sm font-bold text-gray-900">{i === 0 ? "€99.000" : "€98.000"}</p>
            </div>
            <p className="mt-1 text-xs text-gray-500">{c.details}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[c.address, c.owner].map((reason) => <span key={reason} className="rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600">✓ {reason}</span>)}
            </div>
          </div>
        ))}
      </div>
    </ExampleCard>
  );
}

const sections = [
  { key: "history", Icon: PriceHistoryIcon, Example: HistoryExample },
  { key: "market", Icon: PriceAnalysisIcon, Example: MarketExample },
  { key: "duplicates", Icon: DuplicateCheckIcon, Example: DuplicatesExample },
];

export default function ListingSeoSections({ copy }) {
  return (
    <div className="mt-20 sm:mt-28">
      <div className="mb-12 text-center">
        <p className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{copy.guide}</p>
        <p className="mt-3 text-sm text-gray-500 sm:text-base">{copy.guideIntro}</p>
      </div>
      <div className="space-y-12 sm:space-y-16">
        {sections.map(({ key, Icon, Example }, index) => (
          <section key={key} aria-labelledby={`${key}-heading`} className="grid items-center gap-7 border-t border-gray-200 pt-10 lg:grid-cols-2 lg:gap-12">
            <div className={index === 1 ? "lg:order-2" : ""}>
              <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700" aria-hidden="true"><Icon size={23} /></span>
              <h2 id={`${key}-heading`} className="text-2xl font-bold leading-tight tracking-tight text-gray-900">{copy[key].title}</h2>
              <p className="mt-4 text-sm leading-7 text-gray-600">{copy[key].text}</p>
              <p className="mt-4 border-l-2 border-emerald-200 pl-4 text-xs leading-6 text-gray-500">{copy[key].note}</p>
            </div>
            <Example copy={copy} />
          </section>
        ))}
      </div>
      <div className="mt-14 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-6 py-8 text-center sm:mt-20">
        <p className="text-xl font-bold text-gray-900">{copy.cta}</p>
        <p className="mt-2 text-sm text-gray-600">{copy.ctaText}</p>
        <a href="#verifica-link" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-dark">{copy.ctaButton} <span aria-hidden="true" className="ml-2">↑</span></a>
      </div>
    </div>
  );
}

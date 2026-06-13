"use client";

const CREDIT_FEATURE_LABELS_RO = {
  sale_estimate: "Estimări vânzare/cumpărare",
  rent_estimate: "Estimări chirie",
  listing_analysis: "Analiză anunț 999",
  cadastru_lookup: "Căutare date cadastrale",
  yield_calculator: "Calculator randament",
  pdf_report: "Raport PDF",
};

const DEFAULT_LABELS = {
  title: "Acces rămas",
  description: "Utilizări gratuite și cumpărate disponibile în cont.",
  remaining: "Rămas",
  freeBadge: "Gratuit",
  used: ({ used, total }) => `${used}/${total} folosite`,
  feature: (featureKey) => CREDIT_FEATURE_LABELS_RO[featureKey] || featureKey || "—",
};

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString("ro-RO", { maximumFractionDigits: 0 });
}

export default function ProfileCreditBalances({
  credits = [],
  freeMonthlyCredits = [],
  loading = false,
  labels = DEFAULT_LABELS,
  formatValue = formatNumber,
  className = "",
}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const rows = [
    ...freeMonthlyCredits.filter((row) => row.eligible !== false),
    ...credits.map((row) => ({ ...row, source: "paid_credit" })),
  ];

  return (
    <div className={`rounded-2xl border border-gray-100 bg-gray-50 p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{copy.title}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{copy.description}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-5">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-gray-400" />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={`${row.source}-${row.featureKey}`} className="rounded-xl border border-gray-100 bg-white px-3 py-3">
              <div className="flex min-h-10 items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-5 text-gray-900">
                  {copy.feature(row.featureKey)}
                </p>
                {row.source === "free_monthly" && (
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    {copy.freeBadge}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase text-gray-400">{copy.remaining}</p>
                  <p className="text-lg font-bold text-primary">
                    {formatValue(row.remainingUses)}
                  </p>
                </div>
                <p className="text-xs font-medium text-gray-500">
                  {copy.used({
                    used: formatValue(row.totalUsed),
                    total: formatValue(row.totalGranted),
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

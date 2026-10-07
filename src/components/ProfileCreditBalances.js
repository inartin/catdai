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
  isDarkMode = false,
}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const rowsByFeature = new Map();
  for (const row of freeMonthlyCredits) {
    if (!row.featureKey || row.eligible === false) continue;
    rowsByFeature.set(row.featureKey, {
      featureKey: row.featureKey,
      remainingUses: Number(row.remainingUses) || 0,
      totalUsed: Number(row.totalUsed) || 0,
      totalGranted: Number(row.totalGranted) || 0,
    });
  }
  for (const row of credits) {
    if (!row.featureKey || Number(row.totalGranted) <= 0) continue;
    const current = rowsByFeature.get(row.featureKey);
    rowsByFeature.set(row.featureKey, {
      featureKey: row.featureKey,
      remainingUses: (current?.remainingUses || 0) + (Number(row.remainingUses) || 0),
      totalUsed: (current?.totalUsed || 0) + (Number(row.totalUsed) || 0),
      totalGranted: (current?.totalGranted || 0) + (Number(row.totalGranted) || 0),
    });
  }
  const rows = [...rowsByFeature.values()];

  return (
    <div className={`rounded-2xl border p-4 ${isDarkMode ? "border-[#2a2f42] bg-[#1a1d23]" : "border-gray-100 bg-gray-50"} ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className={`text-base font-semibold ${isDarkMode ? "text-[#e2e8f0]" : "text-gray-900"}`}>{copy.title}</h3>
          <p className={`mt-0.5 text-xs ${isDarkMode ? "text-[#9ca3af]" : "text-gray-500"}`}>{copy.description}</p>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-5">
          <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-gray-400" />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.featureKey}
              className={`rounded-xl border px-3 py-3 ${isDarkMode ? "border-[#2a2f42] bg-[#22263a]" : "border-gray-100 bg-white"}`}
            >
              <div className="flex min-h-10 items-start justify-between gap-2">
                <p className={`text-sm font-semibold leading-5 ${isDarkMode ? "text-[#e2e8f0]" : "text-gray-900"}`}>
                  {copy.feature(row.featureKey)}
                </p>
              </div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div>
                  <p className={`text-[11px] font-medium uppercase ${isDarkMode ? "text-[#9ca3af]" : "text-gray-400"}`}>{copy.remaining}</p>
                  <p className={`text-lg font-bold ${isDarkMode ? "text-[#6366f1]" : "text-primary"}`}>
                    {formatValue(row.remainingUses)}
                  </p>
                </div>
                <p className={`text-xs font-medium ${isDarkMode ? "text-[#9ca3af]" : "text-gray-500"}`}>
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

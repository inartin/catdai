"use client";

import Link from "next/link";

const DEFAULT_LABELS = {
  title: "Utilizări disponibile",
  description: "Pentru orice funcție Cat Dai, în orice combinație.",
  purchased: "Cumpărate",
  freeMonthly: "Credite gratuite păstrate",
  addUses: "Adaugă utilizări",
  loading: "Se încarcă...",
};

function remaining(balance) {
  return balance?.remainingUses == null ? null : Math.max(Number(balance.remainingUses) || 0, 0);
}

export default function ProfileCreditBalances({
  sharedCredits = null,
  freeMonthlyCredit = null,
  loading = false,
  labels = DEFAULT_LABELS,
  formatValue = (value) => value.toLocaleString("ro-RO", { maximumFractionDigits: 0 }),
  className = "",
}) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const paid = remaining(sharedCredits);
  const free = remaining(freeMonthlyCredit);
  const total = paid == null || free == null ? null : paid + free;
  const display = (value) => value == null ? "-" : formatValue(value);

  return (
    <section className={`rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6 ${className}`}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-600">{copy.title}</h3>
          {loading ? (
            <div role="status" className="flex h-14 items-center">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-primary" aria-hidden="true" />
              <span className="sr-only">{copy.loading}</span>
            </div>
          ) : (
            <p className="mt-2 text-4xl font-bold tracking-tight text-gray-950 tabular-nums">{display(total)}</p>
          )}
          <p className="mt-2 text-sm leading-6 text-gray-500">{copy.description}</p>
        </div>
        <Link href="/pricing" className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          {copy.addUses}
        </Link>
      </div>
      {!loading && (
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-200 pt-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <dt>{copy.purchased}</dt>
            <dd className="font-semibold text-gray-900 tabular-nums">{display(paid)}</dd>
          </div>
          {free > 0 && <div className="flex items-center gap-2">
            <dt>{copy.freeMonthly}</dt>
            <dd className="font-semibold text-gray-900 tabular-nums">{display(free)}</dd>
          </div>}
        </dl>
      )}
    </section>
  );
}

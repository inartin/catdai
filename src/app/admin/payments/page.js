"use client";

import { useEffect, useState } from "react";
import { PAYMENT_PERIOD_OPTIONS, PAYMENT_PRODUCT_LABELS } from "@/lib/admin-payments";

const STATUS_LABELS = {
  paid: "Paid", partially_refunded: "Partial refund", refund_pending: "Refund pending",
  refunded: "Refunded", chargeback: "Chargeback",
};
const number = (value) => value.toLocaleString("ro-RO");
const money = (value) => (value / 100).toLocaleString("ro-RO", { maximumFractionDigits: 0 });
const date = (value) => new Date(value).toLocaleString("en-GB", {
  timeZone: "Europe/Chisinau", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const productName = (key) => PAYMENT_PRODUCT_LABELS[key] || key || "Payment";

function Stat({ label, value, detail, currency, timeframe, accent = false }) {
  return (
    <div className={`rounded-2xl border p-5 sm:p-6 ${accent ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-white/[0.08] bg-[var(--admin-panel)]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <span className="rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-slate-400">{timeframe}</span>
      </div>
      <p className={`mt-4 break-words text-3xl font-semibold tracking-tight tabular-nums xl:text-4xl ${accent ? "text-emerald-300" : "text-slate-50"}`}>
        {value}<span className="ml-2 text-sm font-medium tracking-normal text-slate-400">{currency}</span>
      </p>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{detail}</p>
    </div>
  );
}

export default function PaymentsPage() {
  const [period, setPeriod] = useState("all");
  const [currency, setCurrency] = useState("");
  const [page, setPage] = useState(1);
  const [requestOptions, setRequestOptions] = useState({ fresh: false });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ period, page: String(page) });
    if (currency) params.set("currency", currency);
    if (requestOptions.fresh) params.set("fresh", "1");
    fetch(`/api/admin/payments?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) { window.location.href = "/admin/login"; return null; }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load payments");
        return data;
      })
      .then((data) => { if (!controller.signal.aborted && data) setResult(data); })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, currency, page, requestOptions]);

  function reload(change, fresh = false) {
    setLoading(true);
    setError(null);
    setResult(null);
    setRequestOptions({ fresh });
    change();
  }
  const totals = result?.totals;
  const selectedCurrency = result?.currency || currency || "MDL";
  const activePeriod = PAYMENT_PERIOD_OPTIONS.find(({ key }) => key === period);
  const timeframe = period === "day" ? "Today" : activePeriod.label;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="mt-1 text-sm text-gray-500">Sales, refunds and payment history.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1" aria-label="Payment period">
            {PAYMENT_PERIOD_OPTIONS.map((option) => (
              <button key={option.key} type="button" aria-pressed={period === option.key}
                onClick={() => { if (period !== option.key) reload(() => { setPeriod(option.key); setPage(1); }); }}
                className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${period === option.key ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" disabled={loading} onClick={() => reload(() => {}, true)}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-primary/40 disabled:cursor-wait disabled:opacity-50">
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <p>{timeframe} · By payment date · Chișinău time · Live payments only</p>
        {result && <p>Updated {date(result.updatedAt)}</p>}
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <p className="font-medium text-red-300">{error}</p>
          <button type="button" onClick={() => reload(() => {}, true)} className="mt-3 cursor-pointer text-sm text-slate-200 underline underline-offset-4">Try again</button>
        </div>
      ) : loading ? (
        <div role="status" aria-label="Loading payments" className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {[0, 1, 2, 3].map((key) => <div key={key} className="h-44 animate-pulse rounded-2xl border border-white/[0.08] bg-[var(--admin-panel)]" />)}
          <span className="sr-only">Loading payments…</span>
        </div>
      ) : result && (
        <>
          {(result.currencies.length > 1 || (currency && !result.currencies.includes(currency) && result.currencies.length > 0)) && (
            <label className="flex items-center gap-3 text-sm text-slate-400">Currency
              <select value={selectedCurrency} onChange={(event) => reload(() => { setCurrency(event.target.value); setPage(1); })} className="rounded-lg border border-gray-200 px-3 py-2">
                {[...new Set([...result.currencies, selectedCurrency])].map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
              <span className="text-xs">Currencies are shown separately.</span>
            </label>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Stat label="Gross sales" timeframe={timeframe} value={money(totals.grossMinor)} currency={selectedCurrency} detail="Total paid by customers" accent />
            <Stat label="After refunds" timeframe={timeframe} value={money(totals.retainedMinor)} currency={selectedCurrency} detail="Before bank and payment-provider fees" />
            <Stat label="Refunds & disputes" timeframe={timeframe} value={money(totals.reversedMinor)} currency={selectedCurrency} detail={`${number(totals.reversedCount)} ${totals.reversedCount === 1 ? "payment" : "payments"} with money returned or disputed`} />
            <Stat label="Payments" timeframe={timeframe} value={number(totals.count)} detail={totals.averageMinor == null ? "No completed payments in this period" : `Average payment ${money(totals.averageMinor)} ${selectedCurrency}`} />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">MAIB and legacy Paddle payments. Fees and final bank payouts are not provided by Checkout. Refunds reflect the latest recorded state of payments made in this period.</p>

          {result.products.length > 0 && (
            <section className="rounded-2xl border border-white/[0.08] bg-[var(--admin-panel)] p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-slate-100">Sales by product</h2>
                <p className="text-xs text-slate-400">After refunds · Before fees · {selectedCurrency}</p>
              </div>
              <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
                {result.products.map((product) => (
                  <div key={product.key}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <p className="text-slate-200">{productName(product.key)} <span className="ml-1 text-xs text-slate-400">{number(product.count)} {product.count === 1 ? "payment" : "payments"}</span></p>
                      <p className="shrink-0 font-semibold text-slate-100 tabular-nums">{money(product.retainedMinor)}</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-indigo-400" style={{ width: `${totals.retainedMinor ? product.retainedMinor / totals.retainedMinor * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--admin-panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-5 sm:px-6">
              <h2 className="font-semibold text-slate-100">Payment history</h2>
              <span className="text-xs text-slate-400">{number(totals.count)} records · {selectedCurrency}</span>
            </div>
            {!result.orders.length ? (
              <div className="px-6 py-16 text-center">
                <p className="font-medium text-slate-200">No payments in this period</p>
                <p className="mt-2 text-sm text-slate-400">Choose a longer period to see earlier payments.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-black/10 text-xs uppercase tracking-wide text-slate-400">
                    <tr>{["Payment date", "Buyer", "Product / order", "Status", "Paid", "Returned", "After refunds"].map((label, index) => <th key={label} scope="col" className={`px-5 py-3 font-medium ${index >= 4 ? "text-right" : ""}`}>{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {result.orders.map((order) => (
                      <tr key={`${order.provider}:${order.id}`} className="hover:bg-white/[0.02]">
                        <td className="whitespace-nowrap px-5 py-4 text-slate-300">{date(order.paid_at)}<p className="mt-1 text-xs uppercase text-slate-500">{order.provider}</p></td>
                        <td className="max-w-60 px-5 py-4"><p className="truncate text-slate-200" title={order.name || order.email || order.user_id || "Deleted account"}>{order.name || order.email || (order.user_id ? "Customer" : "Deleted account")}</p>{order.name && order.email && <p className="mt-1 truncate text-xs text-slate-400" title={order.email}>{order.email}</p>}</td>
                        <td className="max-w-72 px-5 py-4"><p className="text-slate-200">{order.productTitle || productName(order.product_key)}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={`Order: ${order.id}${order.transaction_id ? ` · Transaction: ${order.transaction_id}` : ""}`}>{order.id}</p></td>
                        <td className="px-5 py-4"><span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${order.status === "paid" ? "bg-emerald-400/10 text-emerald-300" : order.status === "chargeback" ? "bg-red-400/10 text-red-300" : "bg-amber-400/10 text-amber-300"}`}>{STATUS_LABELS[order.status] || order.status}</span></td>
                        <td className="whitespace-nowrap px-5 py-4 text-right text-slate-300 tabular-nums">{money(order.gross)}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-right text-slate-400 tabular-nums">{order.reversed ? `−${money(order.reversed)}` : "—"}</td>
                        <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate-100 tabular-nums">{money(order.retained)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.pageCount > 1 && (
              <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-4 text-sm">
                <p className="text-slate-400">Page {result.page} of {result.pageCount}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={result.page === 1} onClick={() => reload(() => setPage(result.page - 1))} className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 disabled:cursor-default disabled:opacity-30">Previous</button>
                  <button type="button" disabled={result.page === result.pageCount} onClick={() => reload(() => setPage(result.page + 1))} className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-slate-200 disabled:cursor-default disabled:opacity-30">Next</button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

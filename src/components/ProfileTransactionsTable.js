"use client";

const DEFAULT_LABELS = {
  empty: "Nu ai plăți încă",
  paymentDate: "Data plății",
  paymentProduct: "Ce ai cumpărat",
  paymentStatus: "Status",
  paymentAmount: "Sumă",
  paymentTransactionId: "ID tranzacție",
  paymentOrderId: "ID comandă",
  loadMore: "Încarcă mai multe",
  loadingMore: "Se încarcă...",
};

function formatNumber(value, lang, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return number.toLocaleString(lang === "ru" ? "ru-RU" : "ro-RO", options);
}

function formatHistoryDate(value, lang) {
  if (!value) return "—";
  const date = new Date(value);
  const locale = lang === "ru" ? "ru-RU" : "ro-RO";
  const datePart = date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
}

function formatPaymentAmount(amountMinor, currencyCode, lang) {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "ro-RO", {
    style: "currency",
    currency: currencyCode || "MDL",
  }).format(amount / 100);
}

export default function ProfileTransactionsTable({
  transactions = [],
  lang = "ro",
  labels = DEFAULT_LABELS,
  formatProduct,
  formatStatus,
  nextCursor = null,
  loadingMore = false,
  onLoadMore = null,
  isDarkMode = false,
}) {
  const copy = { ...DEFAULT_LABELS, ...labels };

  if (transactions.length === 0) {
    return <p className={`py-6 text-center text-sm ${isDarkMode ? "text-[#9ca3af]" : "text-gray-400"}`}>{copy.empty}</p>;
  }

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${isDarkMode ? "border-[#2a2f42] bg-[#22263a]" : "border-gray-100 bg-white"}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className={`text-left text-xs font-medium uppercase ${isDarkMode ? "bg-[#141720] text-[#9ca3af]" : "bg-gray-50 text-gray-500"}`}>
              <th className="px-4 py-3">{copy.paymentDate}</th>
              <th className="px-4 py-3">{copy.paymentProduct}</th>
              <th className="px-4 py-3">{copy.paymentStatus}</th>
              <th className="px-4 py-3 text-right">{copy.paymentAmount}</th>
              <th className="px-4 py-3">{copy.paymentTransactionId}</th>
            </tr>
          </thead>
          <tbody className={isDarkMode ? "divide-y divide-[#2a2f42]" : "divide-y divide-gray-100"}>
            {transactions.map((row) => (
              <tr key={row.id} className={isDarkMode ? "hover:bg-[#2a2f42]" : "hover:bg-gray-50"}>
                <td className={`whitespace-nowrap px-4 py-3 ${isDarkMode ? "text-[#9ca3af]" : "text-gray-600"}`}>
                  {formatHistoryDate(row.paidAt || row.createdAt, lang)}
                </td>
                <td className={`px-4 py-3 font-medium ${isDarkMode ? "text-[#e2e8f0]" : "text-gray-900"}`}>
                  <div>{formatProduct ? formatProduct(row.productKey) : row.productKey || "—"}</div>
                  <div className={`mt-0.5 text-xs font-normal ${isDarkMode ? "text-[#9ca3af]" : "text-gray-500"}`}>
                    {copy.paymentOrderId}: {row.id}
                  </div>
                </td>
                <td className={`whitespace-nowrap px-4 py-3 ${isDarkMode ? "text-[#e2e8f0]" : "text-gray-700"}`}>
                  {formatStatus ? formatStatus(row.status) : row.status || "—"}
                </td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${isDarkMode ? "text-[#e2e8f0]" : "text-gray-900"}`}>
                  {formatPaymentAmount(row.amountMinor, row.currencyCode, lang)}
                </td>
                <td className={`whitespace-nowrap px-4 py-3 font-mono text-xs ${isDarkMode ? "text-[#9ca3af]" : "text-gray-600"}`}>
                  {row.transactionId || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && onLoadMore && (
        <div className={`border-t px-4 py-3 text-center ${isDarkMode ? "border-[#2a2f42]" : "border-gray-100"}`}>
          <button
            type="button"
            onClick={() => onLoadMore(nextCursor)}
            disabled={loadingMore}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${isDarkMode ? "border-[#2a2f42] text-[#e2e8f0] hover:bg-[#2a2f42] disabled:text-[#4b5563]" : "border-gray-200 text-gray-700 hover:bg-gray-50 disabled:text-gray-400"}`}
          >
            {loadingMore ? copy.loadingMore : copy.loadMore}
          </button>
        </div>
      )}
    </div>
  );
}

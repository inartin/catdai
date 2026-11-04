import Tooltip from "@/components/Tooltip";
import { PAYMENT_PRODUCT_LABELS } from "@/lib/admin-payments";

const PRODUCT_STYLES = {
  standard_pack: "bg-green-100 text-green-800 ring-green-200",
  pro_pack: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  extra_pack: "bg-purple-100 text-purple-800 ring-purple-200",
};

export default function AdminUserPayments({ summary, onClick }) {
  if (!summary?.total) return null;

  const first = summary.products[0];
  const productLabel = (key) => PAYMENT_PRODUCT_LABELS[key] || key || "Purchase";
  const details = [
    `${summary.total} payment attempts`,
    ...summary.products.map((product) => `${productLabel(product.key)} × ${product.count}`),
    "Paid includes payments later refunded or disputed. Failed includes canceled, expired and closed checkouts.",
  ].join(" · ");

  return (
    <Tooltip text={details}>
      <button type="button" onClick={onClick} className="cursor-pointer text-left text-xs leading-5">
        {first ? (
          <span className={`inline-flex max-w-48 items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${PRODUCT_STYLES[first.key] || "bg-green-100 text-green-800 ring-green-200"}`}>
            <span className="truncate">{productLabel(first.key)}</span>
            {summary.products.length > 1 && <span className="shrink-0">+{summary.products.length - 1}</span>}
          </span>
        ) : <span className="text-gray-500">No purchases</span>}
        <span className="mt-1 block whitespace-nowrap">
          <span className="text-gray-500">{summary.total} total · </span>
          <span className={summary.paid ? "font-medium text-green-700" : "text-gray-400"}>{summary.paid} paid</span>
          <span className="text-gray-400"> · </span>
          <span className={summary.failed ? "font-medium text-red-600" : "text-gray-400"}>{summary.failed} failed</span>
          {summary.pending > 0 && <span className="text-amber-700"> · {summary.pending} pending</span>}
        </span>
      </button>
    </Tooltip>
  );
}

"use client";

import { useState } from "react";
import CadastralDataCard from "@/components/CadastralDataCard";

const LABELS = {
  cadastral_number: "Cadastral number", apartment: "Apartment / unit", building: "Building",
  lands: "Land parcels", buildings: "Constructions", area_m2: "Area (m²)", estimated_value_lei: "Cadastral value (MDL)",
  classifier: "Building type", is_last_floor: "Last floor", transactions_count: "Transactions",
  real_rights: "Registered rights", room_usage: "Unit use", ownership_type: "Ownership type",
  form_fields: "Property characteristics", map_location: "Map coordinates", map_geometry: "Map outline",
  matched_address: "Matched address", request_address: "Searched address", search_type: "Search by",
  search_label: "Search", unlocked_at: "Result unlocked", id: "Order ID", product_key: "Product",
  product_title: "Purchased service", receipt_email: "Checkout email", created_at: "Saved at checkout",
  paid_at: "Paid at", amount: "Paid amount", refunded: "Refunded amount",
};
const label = key => LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1)).replaceAll("_", " ");
const date = value => value ? new Date(value).toLocaleString("ro-RO", { timeZone: "Europe/Chisinau" }) : "Unavailable";

function customerReport(snapshot) {
  if (!snapshot) return null;
  // Older address reports store the unit number in `apartment` and its facts
  // in flat fields. Adapt only saved values; never enrich from current records.
  const apartment = snapshot.apartment && typeof snapshot.apartment === "object" && !Array.isArray(snapshot.apartment)
    ? snapshot.apartment : {};
  const aliases = {
    area_m2: snapshot.apartment_area_m2,
    floor: snapshot.apartment_floor,
    type: snapshot.apartment_type,
  };
  if (Object.values(aliases).every(value => value == null || value === "")) return snapshot;
  aliases.estimated_value_lei = snapshot.estimated_value_lei;
  const details = { ...apartment };
  for (const [key, value] of Object.entries(aliases)) {
    if ((details[key] == null || details[key] === "") && value != null && value !== "") details[key] = value;
  }
  return { ...snapshot, apartment: details };
}

// Render every saved field, including unfamiliar registry fields and all parcels.
// Large nested values (such as map outlines) remain available without filling the page.
function SavedFields({ value }) {
  if (value === null || value === undefined || value === "") return <span className="text-gray-400">Unavailable</span>;
  if (typeof value !== "object") return <span className="whitespace-pre-wrap break-words">{typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</span>;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item]) : Object.entries(value);
  if (!entries.length) return <span className="text-gray-400">None saved</span>;
  return <dl className="min-w-0 divide-y divide-gray-100">{entries.map(([key, item]) => (
    <div key={key} className="py-2">
      {item && typeof item === "object" ? <details open={!/geometry|coordinates/.test(key)} className="min-w-0">
        <summary className="cursor-pointer font-medium text-gray-700">{label(key)}{Array.isArray(item) ? ` (${item.length})` : ""}</summary>
        <div className="mt-1 border-l border-gray-200 pl-3"><SavedFields value={item} /></div>
      </details> : <div className="grid gap-1 sm:grid-cols-[minmax(8rem,1fr)_2fr] sm:gap-4">
        <dt className="text-gray-500">{label(key)}</dt><dd className="min-w-0 text-gray-900"><SavedFields value={/^(created_at|paid_at|unlocked_at)$/.test(key) ? date(item) : item} /></dd>
      </div>}
    </div>
  ))}</dl>;
}

export default function AdminReviewCadastru({ reviewId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/admin/feedback/${encodeURIComponent(reviewId)}/cadastru`);
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const purchase = data?.purchase;
  const payment = purchase && {
    product_title: purchase.product_title || purchase.product_key,
    amount: `${(purchase.amount_minor / 100).toFixed(2)} ${purchase.currency_code}`,
    refunded: `${(purchase.refunded_minor / 100).toFixed(2)} ${purchase.currency_code}`,
    status: purchase.status, environment: purchase.environment, receipt_email: purchase.receipt_email,
    paid_at: purchase.paid_at, created_at: purchase.created_at, language: purchase.language, id: purchase.id,
  };

  return <div className="mt-4">
    <button type="button" aria-expanded={open} aria-controls={`review-cadastru-${reviewId}`}
      onClick={() => { setOpen(!open); if (!open && !data && !loading) load(); }}
      className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
      {open ? "Hide purchased Cadastru result" : "View purchased Cadastru result"}
    </button>
    {open && <div id={`review-cadastru-${reviewId}`} className="mt-3 space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
      {loading ? <p role="status" className="text-gray-500">Loading saved report…</p>
        : error ? <p role="alert" className="text-red-600">Could not load the report. <button type="button" onClick={load} className="cursor-pointer underline">Retry</button></p>
          : data && <>
            <p className="text-xs leading-5 text-gray-500">Historical report saved at checkout, simplified for review. The returned page could fetch newer data. Nearby places, transport, complaints and market listings were loaded separately and are not recorded in this snapshot.</p>
            {payment && <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="font-semibold text-gray-900">Payment</h3><SavedFields value={payment} />
            </section>}
            {data.search && <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="font-semibold text-gray-900">Reviewed search</h3><SavedFields value={data.search} />
            </section>}
            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="font-semibold text-gray-900">Saved Cadastru data</h3>
              {data.snapshot ? <>
                <CadastralDataCard cadastral={customerReport(data.snapshot)} className="mt-3" />
                <details className="mt-4 border-t border-gray-100 pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-gray-500">All saved fields</summary>
                  <SavedFields value={data.snapshot} />
                </details>
              </> : <p className="mt-2 text-gray-500">{data.unavailable_reason} Historical data cannot be reconstructed from the current property record.</p>}
            </section>
          </>}
    </div>}
  </div>;
}

import { ADMIN_PERIOD_OPTIONS, adminPeriod } from "./admin-periods";

export const PAYMENT_PERIOD_OPTIONS = ADMIN_PERIOD_OPTIONS;

export const CONFIRMED_PAYMENT_STATUSES = ["paid", "partially_refunded", "refund_pending", "refunded", "chargeback"];

export const paymentPeriod = adminPeriod;

export function paymentAmounts(row) {
  const gross = row.amount_minor;
  // The legacy Paddle view has no refund amount; final refund/dispute statuses mean a full reversal.
  const reversed = ["refunded", "chargeback"].includes(row.status) ? gross : row.refunded_minor;
  if (!Number.isSafeInteger(gross) || gross < 0 || !Number.isSafeInteger(reversed) || reversed < 0 || reversed > gross) {
    throw new Error("Invalid stored payment amount");
  }
  return { gross, reversed, retained: gross - reversed };
}

export function summarizePayments(rows) {
  const totals = { grossMinor: 0, reversedMinor: 0, retainedMinor: 0, count: rows.length, reversedCount: 0, averageMinor: null };
  const products = new Map();
  for (const row of rows) {
    const { gross, reversed, retained } = paymentAmounts(row);
    totals.grossMinor += gross;
    totals.reversedMinor += reversed;
    totals.retainedMinor += retained;
    if (reversed > 0) totals.reversedCount++;
    const product = products.get(row.product_key) || { key: row.product_key, count: 0, retainedMinor: 0 };
    product.count++;
    product.retainedMinor += retained;
    products.set(row.product_key, product);
  }
  totals.averageMinor = rows.length ? Math.round(totals.grossMinor / rows.length) : null;
  return { totals, products: [...products.values()].sort((a, b) => b.retainedMinor - a.retainedMinor || b.count - a.count) };
}

export const PAYMENT_PRODUCT_LABELS = {
  standard_pack: "Standard package", pro_pack: "Pro package", extra_pack: "Extra package",
  sale_estimate_single: "Sale estimate", rent_estimate_single: "Rent estimate",
  listing_analysis_single: "Listing analysis", cadastru_lookup_single: "Cadastru lookup",
  yield_calculator_single: "Yield calculator", pdf_report_single: "PDF report",
  credits_10: "10 uses", credits_50: "50 uses", cadastru_lookup_5: "5 Cadastru lookups",
  cadastru_lookup_20: "20 Cadastru lookups", all_features_5: "5 uses per feature",
  all_features_20: "20 uses per feature", property_combo_1: "Property package",
};

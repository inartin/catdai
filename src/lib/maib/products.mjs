const features = ["sale_estimate", "rent_estimate", "listing_analysis", "cadastru_lookup", "yield_calculator", "pdf_report"];
const prices = { standard_pack: 99, pro_pack: 199, extra_pack: 499, sale_estimate_single: 20, rent_estimate_single: 20, listing_analysis_single: 29, cadastru_lookup_single: 19, yield_calculator_single: 29, pdf_report_single: 29 };
export function maibProduct(key) {
  if (typeof key !== "string" || !Object.hasOwn(prices, key)) return null;
  const count = { standard_pack: 2, pro_pack: 10, extra_pack: 50 }[key];
  const grants = count ? Object.fromEntries(features.map(feature => [feature, count])) : { [key.replace(/_single$/, "")]: 1 };
  return { key, amount_minor: prices[key] * 100, amount_mdl: prices[key], currency_code: "MDL", billingMode: "one_time", grants };
}

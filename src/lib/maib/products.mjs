const features = ["sale_estimate", "rent_estimate", "listing_analysis", "cadastru_lookup", "yield_calculator", "pdf_report"];
const allFeatures = (count) => Object.fromEntries(features.map((feature) => [feature, count]));

const products = {
  standard_pack: { amount_mdl: 99, grants: allFeatures(2) },
  pro_pack: { amount_mdl: 199, grants: allFeatures(10) },
  extra_pack: { amount_mdl: 499, grants: allFeatures(50) },
  sale_estimate_single: { amount_mdl: 25, grants: { sale_estimate: 1 } },
  rent_estimate_single: { amount_mdl: 25, grants: { rent_estimate: 1 } },
  listing_analysis_single: { amount_mdl: 25, grants: { listing_analysis: 1 } },
  cadastru_lookup_single: { amount_mdl: 25, grants: { cadastru_lookup: 1 } },
  cadastru_lookup_5: { amount_mdl: 99, grants: { cadastru_lookup: 5 } },
  cadastru_lookup_20: { amount_mdl: 299, grants: { cadastru_lookup: 20 } },
  all_features_20: { amount_mdl: 299, grants: allFeatures(20) },
  all_features_5: { amount_mdl: 99, grants: allFeatures(5) },
  property_combo_1: { amount_mdl: 59, grants: { cadastru_lookup: 1, sale_estimate: 1, pdf_report: 1 } },
  yield_calculator_single: { amount_mdl: 25, grants: { yield_calculator: 1 } },
  pdf_report_single: { amount_mdl: 25, grants: { pdf_report: 1 } },
};

export function maibProduct(key) {
  if (typeof key !== "string" || !Object.hasOwn(products, key)) return null;
  const { amount_mdl, grants } = products[key];
  return { key, amount_minor: amount_mdl * 100, amount_mdl, currency_code: "MDL", billingMode: "one_time", grants: { ...grants } };
}

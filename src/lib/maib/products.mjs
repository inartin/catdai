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

const singlePriceTiers = [[1, 25], [3, 65], [5, 89], [10, 169], [20, 269]];
export const MAX_SINGLE_QUANTITY = 100;

function singlePriceMinor(quantity) {
  const [lastCount, lastPrice] = singlePriceTiers.at(-1);
  if (quantity > lastCount) return Math.round(lastPrice * 100 * quantity / lastCount);
  const index = singlePriceTiers.findIndex(([count]) => count >= quantity);
  const [upperCount, upperPrice] = singlePriceTiers[index];
  if (index === 0) return upperPrice * 100;
  const [lowerCount, lowerPrice] = singlePriceTiers[index - 1];
  return lowerPrice * 100 + Math.round((upperPrice - lowerPrice) * 100 * (quantity - lowerCount) / (upperCount - lowerCount));
}

export function maibProduct(key, quantity = 1) {
  if (typeof key !== "string" || !Object.hasOwn(products, key)) return null;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SINGLE_QUANTITY) return null;
  const single = key.endsWith("_single");
  if (!single && quantity !== 1) return null;
  const { amount_mdl, grants } = products[key];
  const amount_minor = single ? singlePriceMinor(quantity) : amount_mdl * 100;
  const base_minor = amount_mdl * quantity * 100;
  const discount_mdl = (base_minor - amount_minor) / 100;
  const discount_percent = Math.round((base_minor - amount_minor) / base_minor * 100);
  return { key, quantity, discount_mdl, discount_percent, amount_minor, amount_mdl: amount_minor / 100, currency_code: "MDL", billingMode: "one_time",
    grants: Object.fromEntries(Object.entries(grants).map(([feature, count]) => [feature, count * quantity])) };
}

export function maibOrderQuantity(order) {
  const product = products[order?.product_key];
  if (!product || !order.product_key.endsWith("_single")) return 1;
  const quantity = order.grants?.[Object.keys(product.grants)[0]];
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
}

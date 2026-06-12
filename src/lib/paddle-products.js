import { getPaymentProduct, mapPaymentProductGrants } from "@/lib/payment-products";

const PADDLE_PRICE_ENV_BY_PRODUCT = {
  standard_pack: "PADDLE_PRICE_STANDARD_PACK",
  pro_pack: "PADDLE_PRICE_PRO_PACK",
  sale_estimate_single: "PADDLE_PRICE_LISTING_ANALYSIS_SINGLE",
  rent_estimate_single: "PADDLE_PRICE_LISTING_ANALYSIS_SINGLE",
  listing_analysis_single: "PADDLE_PRICE_LISTING_ANALYSIS_SINGLE",
  cadastru_lookup_single: "PADDLE_PRICE_CADASTRU_LOOKUP_SINGLE",
  yield_calculator_single: "PADDLE_PRICE_YIELD_CALCULATOR_SINGLE",
  pdf_report_single: "PADDLE_PRICE_PDF_REPORT_SINGLE",
};
function getPaddlePriceId(productKey) {
  const envKey = PADDLE_PRICE_ENV_BY_PRODUCT[productKey];
  return envKey ? String(process.env[envKey] || "").trim() : "";
}

export function getPaddlePriceEnvKey(productKey) {
  return PADDLE_PRICE_ENV_BY_PRODUCT[String(productKey || "").trim()] || null;
}

export function isValidPaddlePriceId(priceId) {
  return /^pri_[a-z\d]+$/i.test(String(priceId || "").trim());
}

export function getPaddleProduct(productKey) {
  const product = getPaymentProduct(productKey);
  if (!product) return null;

  const rawPrice = getPaddlePriceId(product.key);
  const priceId = isValidPaddlePriceId(rawPrice) ? rawPrice : "";

  if (priceId) {
    return {
      ...product,
      priceId,
      priceReference: priceId,
      priceKind: "catalog",
      amountMinor: product.amountMinor,
      currencyCode: null,
      priceEnvKey: getPaddlePriceEnvKey(product.key),
    };
  }

  return {
    ...product,
    priceId: rawPrice,
    priceReference: rawPrice,
    priceKind: "missing",
    amountMinor: product.amountMinor,
    currencyCode: null,
    priceEnvKey: getPaddlePriceEnvKey(product.key),
  };
}

export function mapPaddleProductGrants(productKey) {
  return mapPaymentProductGrants(productKey);
}

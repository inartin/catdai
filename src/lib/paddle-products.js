import { getPaymentProduct, mapPaymentProductGrants } from "@/lib/payment-products";

const PADDLE_PRICE_ENV_BY_PRODUCT = {
  standard_pack: "PADDLE_PRICE_STANDARD_PACK",
  pro_pack: "PADDLE_PRICE_PRO_PACK",
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

  return {
    ...product,
    priceId: getPaddlePriceId(product.key),
    priceEnvKey: getPaddlePriceEnvKey(product.key),
  };
}

export function mapPaddleProductGrants(productKey) {
  return mapPaymentProductGrants(productKey);
}

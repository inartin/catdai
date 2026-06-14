import { getPricingConfig } from "@/lib/pricing-config";

export const PAYMENT_FEATURE_KEYS = [
  "sale_estimate",
  "rent_estimate",
  "listing_analysis",
  "cadastru_lookup",
  "yield_calculator",
  "pdf_report",
];

const SINGLE_PRODUCT_BY_FEATURE = {
  sale_estimate: "sale_estimate_single",
  rent_estimate: "rent_estimate_single",
  listing_analysis: "listing_analysis_single",
  cadastru_lookup: "cadastru_lookup_single",
  yield_calculator: "yield_calculator_single",
  pdf_report: "pdf_report_single",
};

const SINGLE_PRODUCTS = {
  sale_estimate_single: {
    title: "Evaluare completa",
    description: "One full sale or buy valuation",
    amountEur: null,
    useSharedEvaluationPrice: true,
    grants: { sale_estimate: 1 },
  },
  rent_estimate_single: {
    title: "Evaluare chirie completa",
    description: "One full rent valuation",
    amountEur: null,
    useSharedEvaluationPrice: true,
    grants: { rent_estimate: 1 },
  },
  listing_analysis_single: {
    title: "Analiza anunt 999",
    description: "One 999.md listing analysis",
    amountMdl: 29,
    grants: { listing_analysis: 1 },
  },
  cadastru_lookup_single: {
    title: "Date cadastrale",
    description: "One cadastru lookup",
    amountMdl: 19,
    grants: { cadastru_lookup: 1 },
  },
  yield_calculator_single: {
    title: "Calculator randament",
    description: "One rent-yield calculation",
    amountMdl: 29,
    grants: { yield_calculator: 1 },
  },
  pdf_report_single: {
    title: "Raport PDF",
    description: "One PDF report",
    amountMdl: 29,
    grants: { pdf_report: 1 },
  },
};

function toMinorUnits(mdl) {
  return Math.round(Number(mdl || 0) * 100);
}

export function readEuroAmount(value) {
  const amount = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function getListingAnalysisSinglePriceEur() {
  return readEuroAmount(process.env.PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST);
}

function grantAllFeatures(count) {
  return Object.fromEntries(PAYMENT_FEATURE_KEYS.map((featureKey) => [featureKey, count]));
}

export function getPaymentProducts() {
  const prices = getPricingConfig();

  return {
    standard_pack: {
      title: "Standard",
      description: "2 uses per paid feature",
      amountMdl: prices.standard.mdl,
      grants: grantAllFeatures(2),
    },
    pro_pack: {
      title: "Pro",
      description: "10 uses per paid feature",
      amountMdl: prices.pro.mdl,
      grants: grantAllFeatures(10),
    },
    extra_pack: {
      title: "Extra",
      description: "50 uses per paid feature",
      amountMdl: prices.extra.mdl,
      grants: grantAllFeatures(50),
    },
    ...SINGLE_PRODUCTS,
  };
}

export function getPaymentProduct(productKey) {
  const key = String(productKey || "").trim();
  const product = getPaymentProducts()[key];
  if (!product) return null;

  const sharedListingAnalysisPriceEur = getListingAnalysisSinglePriceEur();
  const amountEur = product.useSharedEvaluationPrice
    ? sharedListingAnalysisPriceEur
    : product.amountEur;
  const amountMdl = product.amountMdl ?? (amountEur != null ? Math.round(amountEur * 20) : null);
  const amountMinor = toMinorUnits(amountMdl);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;

  return {
    key,
    ...product,
    amountEur,
    amountMdl,
    amountMinor,
  };
}

export function getEvaluationPurchaseOffer(featureKey) {
  const normalizedFeatureKey = String(featureKey || "").trim();
  const productKey = normalizedFeatureKey === "rent_estimate"
    ? SINGLE_PRODUCT_BY_FEATURE.rent_estimate
    : normalizedFeatureKey === "sale_estimate"
      ? SINGLE_PRODUCT_BY_FEATURE.sale_estimate
      : null;
  if (!productKey) return null;

  const product = getPaymentProduct(productKey);
  if (!product?.amountEur || !product?.amountMdl) return null;

  return {
    product_key: product.key,
    price_eur: product.amountEur,
    price_mdl: product.amountMdl,
    exchange_rate_mdl_per_eur: 20,
  };
}

export function getFeaturePurchaseOffer(featureKey) {
  const normalizedFeatureKey = String(featureKey || "").trim();
  const productKey = SINGLE_PRODUCT_BY_FEATURE[normalizedFeatureKey];
  if (!productKey) return null;

  const product = getPaymentProduct(productKey);
  if (!product?.amountMdl) return null;

  return {
    product_key: product.key,
    price_eur: product.amountEur || null,
    price_mdl: product.amountMdl,
    exchange_rate_mdl_per_eur: product.amountEur ? 20 : null,
  };
}

export function mapPaymentProductGrants(productKey) {
  const product = getPaymentProduct(productKey);
  return product?.grants || null;
}

export function isKnownPaymentFeature(featureKey) {
  return PAYMENT_FEATURE_KEYS.includes(String(featureKey || ""));
}

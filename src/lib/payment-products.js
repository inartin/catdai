import { getPricingConfig } from "@/lib/pricing-config";

export const PAYMENT_FEATURE_KEYS = [
  "sale_estimate",
  "rent_estimate",
  "listing_analysis",
  "cadastru_lookup",
  "yield_calculator",
  "pdf_report",
];

const SINGLE_PRODUCTS = {
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

function grantAllFeatures(count) {
  return Object.fromEntries(PAYMENT_FEATURE_KEYS.map((featureKey) => [featureKey, count]));
}

export function getPaymentProducts() {
  const prices = getPricingConfig();

  return {
    standard_pack: {
      title: "Standard",
      description: "2 uses per paid feature",
      amountMdl: prices.standard,
      grants: grantAllFeatures(2),
    },
    pro_pack: {
      title: "Pro",
      description: "10 uses per paid feature",
      amountMdl: prices.pro,
      grants: grantAllFeatures(10),
    },
    ...SINGLE_PRODUCTS,
  };
}

export function getPaymentProduct(productKey) {
  const key = String(productKey || "").trim();
  const product = getPaymentProducts()[key];
  if (!product) return null;

  const amountMinor = toMinorUnits(product.amountMdl);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return null;

  return {
    key,
    ...product,
    amountMinor,
  };
}

export function mapPaymentProductGrants(productKey) {
  const product = getPaymentProduct(productKey);
  return product?.grants || null;
}

export function isKnownPaymentFeature(featureKey) {
  return PAYMENT_FEATURE_KEYS.includes(String(featureKey || ""));
}

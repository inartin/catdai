export const FEATURE_PURCHASE_CONTENT = {
  cadastru_lookup_single: {
    title: "cadastru.purchaseTitle",
    checkoutTitle: "cadastru.checkoutTitle",
    summary: "cadastru.purchasePackage",
    benefits: ["Area", "Value", "Building", "Rights", "Map"].map((key) => `cadastru.purchase${key}`),
  },
  sale_estimate_single: {
    title: "payment.featureSaleTitle",
    checkoutTitle: "payment.featureSaleCheckoutTitle",
    summary: "payment.featureSaleSummary",
    benefits: ["Price", "Range", "Stats", "Listings"].map((key) => `payment.featureSale${key}`),
  },
  rent_estimate_single: {
    title: "payment.featureRentTitle",
    checkoutTitle: "payment.featureRentCheckoutTitle",
    summary: "payment.featureRentSummary",
    benefits: ["Price", "Range", "Stats", "Listings"].map((key) => `payment.featureRent${key}`),
  },
  listing_analysis_single: {
    title: "payment.featureListingTitle",
    checkoutTitle: "payment.featureListingCheckoutTitle",
    summary: "payment.featureListingSummary",
    benefits: ["Comparison", "Price", "History", "Listings", "Duplicates"].map((key) => `payment.featureListing${key}`),
  },
  yield_calculator_single: {
    title: "payment.featureYieldTitle",
    checkoutTitle: "payment.featureYieldCheckoutTitle",
    summary: "payment.featureYieldSummary",
    benefits: ["Income", "Return", "Tax", "Chart"].map((key) => `payment.featureYield${key}`),
  },
  pdf_report_single: {
    title: "payment.featurePdfTitle",
    checkoutTitle: "payment.featurePdfCheckoutTitle",
    summary: "payment.featurePdfSummary",
    benefits: ["Download", "Price", "Property", "Sections", "Qr"].map((key) => `payment.featurePdf${key}`),
  },
};

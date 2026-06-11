import {
  PAYMENT_FEATURE_KEYS,
  getPaymentProduct,
  getPaymentProducts,
  isKnownPaymentFeature,
  mapPaymentProductGrants,
} from "@/lib/payment-products";

export const PAYNET_FEATURE_KEYS = PAYMENT_FEATURE_KEYS;

export function getPaynetProducts() {
  return getPaymentProducts();
}

export function getPaynetProduct(productKey) {
  const product = getPaymentProduct(productKey);
  if (!product) return null;

  return {
    ...product,
    currency: 498,
  };
}

export function buildPaynetProductLines(product) {
  return [
    {
      GroupName: null,
      QualitiesConcat: null,
      LineNo: 1,
      GroupId: null,
      Code: product.key,
      Barcode: null,
      Name: product.title,
      Description: product.description,
      UnitPrice: product.amountMinor,
      UnitProduct: null,
      Quantity: 100,
      Amount: null,
      Dimensions: null,
      Qualities: null,
      TotalAmount: product.amountMinor,
    },
  ];
}

export function buildPaynetService(product) {
  return {
    Name: "CatDai",
    Description: product.description,
    Amount: product.amountMinor,
    Products: buildPaynetProductLines(product),
  };
}

export function mapProductGrants(productKey) {
  return mapPaymentProductGrants(productKey);
}

export function isKnownPaynetFeature(featureKey) {
  return isKnownPaymentFeature(featureKey);
}

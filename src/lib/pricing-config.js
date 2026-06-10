const PRICE_ENV_KEYS = {
  standard: "CATDAI_PRICE_STANDARD_MDL",
  pro: "CATDAI_PRICE_PRO_MDL",
  extra: "CATDAI_PRICE_EXTRA_MDL",
};

const DEFAULT_PRICES = {
  standard: 99,
  pro: 199,
  extra: 499,
};

function readPositiveInteger(key, fallback) {
  const value = Number.parseInt(process.env[PRICE_ENV_KEYS[key]], 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getPricingConfig() {
  return Object.fromEntries(
    Object.entries(DEFAULT_PRICES).map(([key, fallback]) => [
      key,
      readPositiveInteger(key, fallback),
    ])
  );
}

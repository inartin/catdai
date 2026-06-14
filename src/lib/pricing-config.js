const PRICE_ENV_KEYS = {
  standard: "CATDAI_PRICE_STANDARD_MDL",
  pro: "CATDAI_PRICE_PRO_MDL",
  extra: "CATDAI_PRICE_EXTRA_MDL",
};

const EUR_PRICE_ENV_KEYS = {
  standard: "NEXT_PUBLIC_PRICE_STANDARD_PACK_COST",
  pro: "NEXT_PUBLIC_PRICE_PRO_PACK_COST",
  extra: "NEXT_PUBLIC_PRICE_EXTRA_PACK_COST",
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

function readPositivePrice(key) {
  const value = Number.parseFloat(process.env[EUR_PRICE_ENV_KEYS[key]]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function getPricingConfig() {
  return Object.fromEntries(
    Object.entries(DEFAULT_PRICES).map(([key, fallback]) => [
      key,
      {
        mdl: readPositiveInteger(key, fallback),
        eur: readPositivePrice(key),
      },
    ])
  );
}

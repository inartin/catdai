import ro from '../../locales/ro.json' with { type: 'json' };
import ru from '../../locales/ru.json' with { type: 'json' };

export const MAIB_TERMS_VERSION = '2026-10-06';
export const MAIB_FEATURE_LABELS = {
  sale_estimate: 'pricing.featureSale', rent_estimate: 'pricing.featureRent',
  listing_analysis: 'pricing.feature999', cadastru_lookup: 'pricing.featureCadastru',
  yield_calculator: 'pricing.featureYield', pdf_report: 'pricing.featurePdf',
};

export function receiptEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  if (email.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/.test(email) || /@auth\.catdai\.md$/i.test(email)) return null;
  const local = email.split('@')[0];
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  return email;
}

export function purchaseMessages(language) { return language === 'ru' ? ru : ro; }
export function maibProductTitle(key, language) {
  return purchaseMessages(language)[`profile.paymentProduct.${key}`];
}

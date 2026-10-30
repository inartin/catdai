import ro from '../../locales/ro.json' with { type: 'json' };
import ru from '../../locales/ru.json' with { type: 'json' };
import en from '../../locales/en.json' with { type: 'json' };

export const MAIB_TERMS_VERSION = '2026-10-10';
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

export function purchaseMessages(language) { return language === 'en' ? en : language === 'ru' ? ru : ro; }
export function maibProductTitle(key, language, quantity = 1, checkoutSource) {
  const messages = purchaseMessages(language);
  const title = messages[`profile.paymentProduct.${key}`];
  if (title && checkoutSource === 'pricing' && key.endsWith('_single')) {
    const plural = new Intl.PluralRules(['ro', 'ru', 'en'].includes(language) ? language : 'ro').select(quantity);
    const separator = language !== 'ru' && language !== 'en' && plural === 'other' ? ' de ' : ' ';
    return `${quantity}${separator}${messages[`pricing.quantityUnit.${plural}`]}`;
  }
  return title && quantity > 1 ? `${title} × ${quantity}` : title;
}

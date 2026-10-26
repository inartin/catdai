import { getCanonicalSiteUrl } from './seo.js';

export function paymentSiteOrigin(fallback = process.env.MAIB_PUBLIC_URL || getCanonicalSiteUrl()) {
  return new URL(process.env.NODE_ENV === 'development' ? 'https://dev.catdai.md' : fallback).origin;
}

// Keep same-origin app navigation in production; development always uses the public dev site.
export function paymentAppLink(path) {
  return process.env.NODE_ENV === 'development' ? new URL(path, paymentSiteOrigin()).toString() : path;
}

export function featureCheckoutUrl(productKey, lang, currentUrl) {
  const current = new URL(currentUrl);
  const url = new URL('/payment/checkout', paymentSiteOrigin(current.origin));
  url.searchParams.set('product_key', productKey);
  url.searchParams.set('lang', lang);
  url.searchParams.set('return_to', `${current.pathname}${current.search}`);
  return url.toString();
}

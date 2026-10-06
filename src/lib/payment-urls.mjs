import { getCanonicalSiteUrl } from './seo.js';

export function paymentSiteOrigin(fallback = process.env.MAIB_PUBLIC_URL || getCanonicalSiteUrl()) {
  return new URL(process.env.NODE_ENV === 'development' ? 'https://dev.catdai.md' : fallback).origin;
}

// Keep same-origin app navigation in production; development always uses the public dev site.
export function paymentAppLink(path) {
  return process.env.NODE_ENV === 'development' ? new URL(path, paymentSiteOrigin()).toString() : path;
}

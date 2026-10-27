import { featureResultPath } from '../guest-checkout.mjs';
import { maibProduct } from './products.mjs';

export const MAIB_FINAL_STATUSES = ['paid', 'partially_refunded', 'refunded', 'failed', 'expired', 'canceled'];
export const MAIB_RETRY_STATUSES = ['failed', 'expired', 'canceled'];

// Only the authenticated order supplies the purchase context and destination.
export function maibResultContext(order) {
  const returnTo = featureResultPath(order?.return_to);
  const pathname = returnTo ? new URL(returnTo, 'https://catdai.local').pathname : '';
  const kind = pathname.includes('/cadastru/rezultat') ? 'cadastru'
    : pathname.includes('/evaluare') ? 'estimate'
    : pathname.includes('/anunt') ? 'listing'
    : pathname.includes('/calculator') ? 'yield' : 'general';
  const grants = Object.entries(order?.grants || {}).filter(([, count]) => count > 0);
  const feature = returnTo && grants.length === 1 ? grants[0][0] : 'general';
  return { returnTo: returnTo || '/profile', autoReturnTo: returnTo, kind, feature,
    count: grants.reduce((sum, [, count]) => sum + count, 0) };
}

export function maibRetryUrl(order, lang) {
  if (!MAIB_RETRY_STATUSES.includes(order?.status) || !maibProduct(order.product_key, order.quantity || 1)) return null;
  const context = maibResultContext(order);
  const params = new URLSearchParams({ product_key: order.product_key, quantity: String(order.quantity || 1),
    lang, return_to: context.returnTo });
  if (!context.autoReturnTo) params.set('checkout_source', 'pricing');
  return `/payment/maib/checkout?${params}`;
}

// A guest checkout must originate from a feature result. Pricing keeps its login gate.
export function featureResultPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://catdai.local');
    return url.origin === 'https://catdai.local' && /^\/(?:ro\/|ru\/|en\/)?(?:cadastru\/rezultat|evaluare|anunt|calculator)\/?$/.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}

export function allowsGuestCheckout({ checkout_source, return_to } = {}) {
  return checkout_source !== 'pricing' && Boolean(featureResultPath(return_to));
}

const ACCOUNT_PROMPT_KEY = 'catdai:guest-account-prompt';
const ACCOUNT_PROMPT_MAX_AGE = 10 * 60 * 1000;

// Anchors only select a section of the same result; query parameters identify it.
function resultIdentity(value) {
  const path = featureResultPath(value);
  if (!path) return null;
  const url = new URL(path, 'https://catdai.local');
  url.searchParams.sort();
  return `${url.pathname}${url.search}`;
}

// Called only with the authenticated payment-status response, before returning.
export function queueGuestAccountPrompt({ userId, provider, order }, storage) {
  const result = resultIdentity(order?.return_to);
  if (!userId || !order?.order_id || !result || !['paid', 'partially_refunded'].includes(order.status)) return;
  try {
    storage ??= globalThis.sessionStorage;
    const shownKey = `${ACCOUNT_PROMPT_KEY}:shown:${provider}:${order.order_id}`;
    if (storage.getItem(shownKey)) return;
    storage.setItem(ACCOUNT_PROMPT_KEY, JSON.stringify({ userId, result, shownKey, createdAt: Date.now() }));
  } catch { /* This optional notice must never block the paid result. */ }
}

export function consumeGuestAccountPrompt(userId, resultPath, storage) {
  try {
    storage ??= globalThis.sessionStorage;
    const raw = storage.getItem(ACCOUNT_PROMPT_KEY);
    if (!raw) return false;
    storage.removeItem(ACCOUNT_PROMPT_KEY);
    const notice = JSON.parse(raw);
    const age = Date.now() - notice.createdAt;
    if (notice.userId !== userId || notice.result !== resultIdentity(resultPath)
      || !Number.isFinite(age) || age < 0 || age > ACCOUNT_PROMPT_MAX_AGE || storage.getItem(notice.shownKey)) return false;
    storage.setItem(notice.shownKey, '1');
    return true;
  } catch { return false; }
}

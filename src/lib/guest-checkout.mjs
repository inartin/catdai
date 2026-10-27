// A guest checkout must originate from a feature result. Pricing keeps its login gate.
export function featureResultPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://catdai.local');
    return url.origin === 'https://catdai.local' && /^\/(?:ro\/|ru\/)?(?:cadastru\/rezultat|evaluare|anunt|calculator)\/?$/.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}

export function allowsGuestCheckout({ checkout_source, return_to } = {}) {
  return checkout_source !== 'pricing' && Boolean(featureResultPath(return_to));
}

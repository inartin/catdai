'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/LanguageContext';
import AuthOptions from '@/components/AuthOptions';
import Footer from '@/components/Footer';
import { maibProduct } from '@/lib/maib/products.mjs';
import { MAIB_TERMS_VERSION, MAIB_FEATURE_LABELS, receiptEmail, maibProductTitle } from '@/lib/maib/purchase.mjs';
import { trackPaymentCheckoutEvent } from '@/lib/tracking';
import { paymentAppLink } from '@/lib/payment-urls.mjs';
import LockIcon from '@/components/icons/LockIcon';
import FeaturePurchaseBenefits from '@/components/FeaturePurchaseBenefits';
import { FEATURE_PURCHASE_CONTENT } from '@/lib/feature-purchase-content';

function featureResultPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://catdai.local');
    return url.origin === 'https://catdai.local' && /^\/(?:ro\/|ru\/)?(?:cadastru\/rezultat|evaluare|anunt|calculator)\/?$/.test(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch { return null; }
}

export default function MaibPaymentPage({ result = false, sandbox = false }) {
  const { session, user, loading } = useAuth();
  const { t, lang, setLang } = useTranslation();
  const [params, setParams] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [emailInput, setEmailInput] = useState(null);
  const tracked = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => { setParams(new URLSearchParams(window.location.search)); }, []);
  useEffect(() => {
    const requested = params?.get('lang');
    if (['ro','ru'].includes(requested) && requested !== lang) setLang(requested);
  }, [params, lang, setLang]);
  const quantity = params?.has('quantity') ? Number(params.get('quantity')) : 1;
  const product = maibProduct(result ? order?.product_key : params?.get('product_key'), result ? 1 : quantity);
  const email = emailInput ?? receiptEmail(user?.email) ?? '';
  const grants = order?.grants || product?.grants || {};
  useEffect(() => {
    if (loading || !params || result || tracked.current) return;
    tracked.current = true;
    trackPaymentCheckoutEvent('checkout_page_opened', { accessToken: session?.access_token, provider: 'maib', product_key: params.get('product_key') });
  }, [loading, params, result, session?.access_token]);
  useEffect(() => {
    if (!result || !params || !session?.access_token) return;
    let stopped = false;
    let timer;
    let checks = 0;
    async function poll() {
      try {
        const response = await fetch(`/api/payments/maib/status?order_id=${encodeURIComponent(params.get('order_id') || params.get('orderId') || '')}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error('status');
        if (stopped) return;
        setOrder(data); setError('');
        if (['paid','partially_refunded','refunded','failed','expired','canceled'].includes(data.status)) {
          sessionStorage.removeItem(`catdai:maib:request:${user.id}:${data.product_key}${data.quantity > 1 ? `:${data.quantity}` : ''}`);
        } else if (++checks < 24) timer = setTimeout(poll, 5000);
      } catch {
        if (!stopped) { setError(t('maib.statusError')); if (++checks < 24) timer = setTimeout(poll, 5000); }
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [result, params, session?.access_token, user?.id, refresh, t]);
  async function start(event) {
    event.preventDefault();
    if (inFlight.current || !product || !session?.access_token || !accepted || !receiptEmail(email)) return;
    inFlight.current = true; setBusy(true); setError('');
    trackPaymentCheckoutEvent('maib_continue_clicked', { accessToken: session.access_token, provider: 'maib', product_key: product.key });
    try {
      const key = `catdai:maib:request:${user.id}:${product.key}${product.quantity > 1 ? `:${product.quantity}` : ''}`;
      const requestKey = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, requestKey);
      const response = await fetch('/api/payments/maib/create', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product_key: product.key, quantity: product.quantity, lang, checkout_source: params.get('checkout_source'), return_to: params.get('return_to'), request_key: requestKey, terms_accepted: accepted, terms_version: MAIB_TERMS_VERSION, receipt_email: receiptEmail(email) }) });
      const data = await response.json();
      if (!response.ok) throw new Error('checkout');
      trackPaymentCheckoutEvent('checkout_order_created', { accessToken: session.access_token, provider: 'maib', order_id: data.order_id, product_key: product.key });
      if (data.checkout?.url) window.location.assign(data.checkout.url);
      else window.location.assign(paymentAppLink(`/payment/maib/success?order_id=${encodeURIComponent(data.order_id)}&lang=${lang}`));
    } catch { setError(t('maib.checkoutError')); setBusy(false); inFlight.current = false; }
  }
  // The result destination comes only from the authenticated server order.
  const returnHref = paymentAppLink(order?.return_to || '/profile');
  const amount = `${((order?.amount_minor ?? product?.amount_minor ?? 0) / 100).toLocaleString(lang === 'ru' ? 'ru-MD' : 'ro-MD')} ${order?.currency_code || product?.currency_code || 'MDL'}`;
  const useCount = Object.values(grants).reduce((total, count) => total + count, 0);
  const usePlural = new Intl.PluralRules(lang).select(useCount);
  const hasUseCountTitle = params?.get('checkout_source') === 'pricing' || product?.key.startsWith('all_features_');
  const isFeatureCheckout = !result && params?.get('checkout_source') !== 'pricing' && product?.key.endsWith('_single');
  const featureContent = isFeatureCheckout ? FEATURE_PURCHASE_CONTENT[product.key] : null;
  const isContextualCheckout = Boolean(featureContent);
  const backToResultPath = isContextualCheckout ? featureResultPath(params?.get('return_to')) : null;
  return <div className={`flex min-h-screen flex-col text-gray-950 ${isContextualCheckout ? 'bg-gray-50' : 'bg-[#f7f8f5]'}`}>
    <header className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-16 max-w-3xl items-center px-6">
        <Link href={paymentAppLink('/')} aria-label={t('nav.homeAriaLabel')} className="flex items-center gap-3 whitespace-nowrap">
          <img src="/icon0.svg" alt="" className="h-11 w-auto object-contain" />
          <span className="text-lg font-semibold tracking-tight">Cât Dai?</span>
        </Link>
      </div>
    </header>
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      {backToResultPath && <Link href={paymentAppLink(backToResultPath)} className="mb-5 inline-flex items-center gap-2 rounded text-sm font-medium text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="m12 19-7-7 7-7M5 12h14" /></svg>
        {t('payment.checkoutBackToResult')}
      </Link>}
      <div className="flex items-center gap-3">
        {isContextualCheckout && <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700"><LockIcon size={20} /></span>}
        <h1 className="text-3xl font-bold">{t(result ? 'maib.resultTitle' : 'payment.checkoutTitle')}</h1>
      </div>
      {result && sandbox && <p className="mt-3 text-sm font-semibold text-amber-800">{t("maib.sandbox")}</p>}
      <section className={`mt-6 bg-white p-6 shadow-sm ${isContextualCheckout ? 'rounded-2xl border-2 border-emerald-200' : 'rounded-xl border border-gray-200'}`}>
        {product && <>
          <div className="mb-4 flex justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">{isContextualCheckout ? t(featureContent.checkoutTitle) : order?.product_title || maibProductTitle(product.key, lang, product.quantity, result ? undefined : params?.get('checkout_source'))}</h2>
              {result ? <><p className="mt-2 text-sm text-gray-600">{t('maib.oneTime')}</p><p className="mt-1 text-sm text-gray-600">{t('maib.quantity')}: {order?.quantity || product.quantity}</p></> : <p className="mt-2 text-sm text-gray-600">
                {isContextualCheckout ? t(`payment.checkoutUnlocks.${usePlural}`, { count: useCount }) : hasUseCountTitle ? t('maib.extraBadge') : t(`maib.checkoutUses.${usePlural}`, { count: useCount })}
              </p>}
            </div>
            <strong className={`shrink-0 text-xl ${isContextualCheckout ? 'text-emerald-800' : ''}`}>{amount}</strong>
          </div>
          {isContextualCheckout && <>
            <p className="border-t border-emerald-100 pt-4 text-sm font-semibold text-gray-950">{t('payment.featureIncludes')}</p>
            <FeaturePurchaseBenefits productKey={product.key} className="mb-6 mt-3" />
          </>}
          {result && <ul className="mb-5 space-y-3 text-sm">
            {Object.entries(grants).filter(([feature]) => MAIB_FEATURE_LABELS[feature]).map(([feature, count]) => <li key={feature}><p className="font-semibold">{t(MAIB_FEATURE_LABELS[feature])} · {t('maib.uses', { count })}</p>{result && <p className="mt-1 text-gray-600">{t(`maib.service.${feature}`)}</p>}</li>)}
          </ul>}
          {!result && !isFeatureCheckout && <p className="mb-5 text-sm text-gray-600">{t('maib.checkoutCreditNote')}</p>}
        </>}
        {loading ? <p>{t('payment.checkoutLoading')}</p> : !session ? <><p className="mb-5">{t('payment.loginRequiredForCheckout')}</p><AuthOptions /></> : result ? <>
          <p role="status" className="text-lg font-semibold">{t(`maib.status.${order?.status || 'pending'}`)}</p>
          {order && <dl className="mt-5 space-y-3 text-sm"><div><dt className="font-semibold">{t('maib.orderNumber')}</dt><dd className="mt-1 break-all text-gray-600">{order.order_id}</dd></div><div><dt className="font-semibold">{t('maib.paymentDate')}</dt><dd className="mt-1 text-gray-600">{order.paid_at ? new Date(order.paid_at).toLocaleString(lang === 'ru' ? 'ru-MD' : 'ro-MD', { timeZone: 'Europe/Chisinau', dateStyle: 'long', timeStyle: 'short' }) : t('maib.notPaid')}</dd></div></dl>}
          <div className="mt-6 flex flex-wrap gap-4"><Link href={returnHref} className="rounded-lg bg-primary px-5 py-3 font-semibold text-white">{t('payment.backToEvaluation')}</Link><button onClick={() => setRefresh(value => value + 1)} className="rounded-lg border px-5 py-3">{t('maib.refresh')}</button></div>
        </> : product ? <>
          <form onSubmit={start}>
            <label htmlFor="receipt-email" className="block text-sm font-semibold">{t('maib.receiptEmail')}</label>
            <input id="receipt-email" type="email" autoComplete="email" placeholder={t('maib.receiptEmailPlaceholder')} required maxLength={254} value={email} onChange={event => setEmailInput(event.target.value)} disabled={busy} className="mt-2 mb-5 w-full rounded-lg border border-gray-300 px-3 py-3" />
            <label className="mb-4 flex items-start gap-3 text-sm"><input type="checkbox" required checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={busy} className="mt-1 h-4 w-4 shrink-0 accent-emerald-700" /><span>{t('maib.acceptTerms')} <Link href={paymentAppLink('/terms')} target="_blank" rel="noopener noreferrer" className="underline">{t('footer.terms')}</Link></span></label>
            <button type="submit" disabled={busy || !accepted || !receiptEmail(email)} className={`w-full rounded-lg px-5 py-3 font-semibold text-white disabled:opacity-50 ${isContextualCheckout ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-primary'}`}>{busy ? t('payment.checkoutLoading') : t('maib.pay', { amount })}</button>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>{t('maib.securePayment')}</p>
          </form>
        </> : <p>{t('maib.invalidProduct')}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      </section>
      {!result && <Link href={paymentAppLink('/pricing')} className="mx-auto mt-5 block w-fit text-sm text-gray-500 underline underline-offset-4 hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
        {t('payment.showAllPackages')}
      </Link>}
    </main>
    {!result && <Footer checkout />}
  </div>;
}

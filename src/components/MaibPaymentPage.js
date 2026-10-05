'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/LanguageContext';
import AuthOptions from '@/components/AuthOptions';
import { maibProduct } from '@/lib/maib/products.mjs';
import { trackPaymentCheckoutEvent } from '@/lib/tracking';

export default function MaibPaymentPage({ result = false, sandbox = false }) {
  const { session, user, loading } = useAuth();
  const { t, lang, setLang } = useTranslation();
  const [params, setParams] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const tracked = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => { setParams(new URLSearchParams(window.location.search)); }, []);
  useEffect(() => {
    const requested = params?.get('lang');
    if (['ro','ru'].includes(requested) && requested !== lang) setLang(requested);
  }, [params, lang, setLang]);
  const product = maibProduct(params?.get('product_key') || order?.product_key);
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
          sessionStorage.removeItem(`catdai:maib:request:${user.id}:${data.product_key}`);
        } else if (++checks < 24) timer = setTimeout(poll, 5000);
      } catch {
        if (!stopped) { setError(t('maib.statusError')); if (++checks < 24) timer = setTimeout(poll, 5000); }
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [result, params, session?.access_token, user?.id, refresh, t]);
  async function start() {
    if (inFlight.current || !product || !session?.access_token) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const key = `catdai:maib:request:${user.id}:${product.key}`;
      const requestKey = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, requestKey);
      const response = await fetch('/api/payments/maib/create', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ product_key: product.key, lang, return_to: params.get('return_to'), request_key: requestKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error('checkout');
      trackPaymentCheckoutEvent('checkout_order_created', { accessToken: session.access_token, provider: 'maib', order_id: data.order_id, product_key: product.key });
      if (data.checkout?.url) window.location.assign(data.checkout.url);
      else window.location.assign(`/payment/maib/success?order_id=${encodeURIComponent(data.order_id)}&lang=${lang}`);
    } catch { setError(t('maib.checkoutError')); setBusy(false); inFlight.current = false; }
  }
  // The result destination comes only from the authenticated server order.
  const returnHref = order?.return_to || '/profile';
  return <div className="min-h-screen bg-[#f7f8f5] text-gray-950">
    <header className="border-b border-gray-100 bg-white"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6"><Link href="/" className="text-lg font-semibold">Cât Dai?</Link><span className="text-sm font-semibold">{t('payment.secureLabel')} · maib</span></div></header>
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-bold">{t(result ? 'maib.resultTitle' : 'payment.checkoutTitle')}</h1>
      {sandbox && <p className="mt-3 text-sm font-semibold text-amber-800">{t("maib.sandbox")}</p>}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {product && <div className="mb-6 flex justify-between gap-4"><div><h2 className="text-xl font-bold">{t(`profile.paymentProduct.${product.key}`)}</h2><p className="mt-2 text-sm text-gray-600">{t('maib.oneTime')}</p></div><strong className="text-xl">{(order?.amount_minor ?? product.amount_minor) / 100} MDL</strong></div>}
        {loading ? <p>{t('payment.checkoutLoading')}</p> : !session ? <><p className="mb-5">{t('payment.loginRequiredForCheckout')}</p><AuthOptions /></> : result ? <>
          <p role="status" className="text-lg font-semibold">{t(`maib.status.${order?.status || 'pending'}`)}</p>
          <div className="mt-6 flex flex-wrap gap-4"><Link href={returnHref} className="rounded-lg bg-primary px-5 py-3 font-semibold text-white">{t('payment.backToEvaluation')}</Link><button onClick={() => setRefresh(value => value + 1)} className="rounded-lg border px-5 py-3">{t('maib.refresh')}</button></div>
        </> : product ? <>
          <p className="mb-5 text-sm text-gray-600">{t('maib.hosted')}</p>
          <p className="mb-5 text-xs text-gray-500">{t('maib.terms')} <Link href="/terms" className="underline">{t('footer.terms')}</Link> · <Link href="/refund" className="underline">{t('maib.refundPolicy')}</Link></p>
          <button onClick={start} disabled={busy} className="w-full rounded-lg bg-primary px-5 py-3 font-semibold text-white disabled:opacity-50">{t(busy ? 'payment.checkoutLoading' : 'maib.pay')}</button>
        </> : <p>{t('maib.invalidProduct')}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      </section>
    </main>
  </div>;
}

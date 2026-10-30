import Link from 'next/link';
import { MAIB_FEATURE_LABELS, maibProductTitle } from '@/lib/maib/purchase.mjs';
import { MAIB_FINAL_STATUSES, MAIB_RETRY_STATUSES, maibResultContext, maibRetryUrl } from '@/lib/maib/result.mjs';
import { paymentAppLink } from '@/lib/payment-urls.mjs';

export default function MaibPaymentResultCard({ order, checking, error, lang, t, onRefresh, sandbox }) {
  const context = maibResultContext(order);
  const status = order?.status || 'pending';
  const paid = ['paid', 'partially_refunded'].includes(status);
  const failed = MAIB_RETRY_STATUSES.includes(status);
  const pending = !MAIB_FINAL_STATUSES.includes(status);
  const retryUrl = maibRetryUrl(order, lang);
  const plural = new Intl.PluralRules(lang).select(context.count);
  const title = paid ? status === 'paid' ? t('maib.result.successTitle') : t('maib.status.partially_refunded')
    : failed ? t('maib.result.failedTitle') : status === 'refunded' ? t('maib.status.refunded')
    : error && !order ? t('payment.statusUnavailableTitle') : t('maib.result.pendingTitle');
  const description = paid ? t(`maib.result.purchased.${context.feature}.${plural}`, { count: context.count })
    : failed ? t('maib.result.failedMessage') : status === 'refunded' ? '' : t('maib.result.pendingMessage');
  const buttonClass = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60';
  const amount = order ? `${(order.amount_minor / 100).toLocaleString(lang === 'en' ? 'en-GB' : lang === 'ru' ? 'ru-MD' : 'ro-MD')} ${order.currency_code}` : '';

  return <section aria-labelledby="payment-result-title" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
    <div role={failed ? 'alert' : 'status'} aria-live="polite" className="text-center">
      <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`mx-auto h-7 w-7 ${paid ? 'text-emerald-600' : failed ? 'text-red-600' : 'text-amber-600'}`}>
        <circle cx="14" cy="14" r="11.5" />
        {paid ? <path d="m9 14 3.2 3.2L19 10" /> : failed ? <path d="m10 10 8 8m0-8-8 8" /> : <path d="M14 7.5V14l4 2.5" />}
      </svg>
      <h1 id="payment-result-title" className="mt-3 text-xl font-semibold tracking-tight text-gray-950">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-gray-500 sm:text-base">{description}</p>}
    </div>

    {order && <div className="mt-7 text-sm font-semibold leading-6 text-gray-950 sm:text-base">
      <h2>{order.product_title || maibProductTitle(order.product_key, lang, order.quantity)}</h2>
      <p className="mt-1">{amount}</p>
    </div>}

    <div className="mt-4">
      {pending ? <button type="button" onClick={onRefresh} disabled={checking} className={buttonClass}>
        {t(checking ? 'maib.result.checking' : 'maib.refresh')}
      </button> : retryUrl ? <Link href={paymentAppLink(retryUrl)} className={buttonClass}>{t('maib.result.retry')}</Link>
        : <Link href={paymentAppLink(context.returnTo)} className={buttonClass}>
          {t(`maib.result.${paid ? 'view' : 'back'}.${context.kind}`)}
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
        </Link>}
      {(failed || pending) && order && <Link href={paymentAppLink(context.returnTo)} className="mx-auto mt-4 block w-fit text-center text-sm font-medium text-gray-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">{t(`maib.result.back.${context.kind}`)}</Link>}
    </div>
    {error && <p role="alert" className="mt-4 text-center text-sm leading-6 text-red-700">{error}</p>}

    {order && <details className="group mt-5">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded text-xs text-gray-500 hover:text-gray-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
        {t('maib.result.details')}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180"><path d="m6 8 4 4 4-4" /></svg>
      </summary>
      <div className="mt-3 border-t border-gray-100 pt-5">
        {sandbox && <p className="mb-4 text-xs font-medium text-amber-800">{t('maib.sandbox')}</p>}
        <dl className="space-y-4 text-sm">
          <div><dt className="font-medium text-gray-900">{t('maib.orderNumber')}</dt><dd className="mt-1 break-all text-gray-500">{order.order_id}</dd></div>
          <div><dt className="font-medium text-gray-900">{t('payment.statusLabel')}</dt><dd className="mt-1 text-gray-500">{t(`maib.status.${status}`)}</dd></div>
          <div><dt className="font-medium text-gray-900">{t('maib.paymentDate')}</dt><dd className="mt-1 text-gray-500">{order.paid_at ? new Date(order.paid_at).toLocaleString(lang === 'en' ? 'en-GB' : lang === 'ru' ? 'ru-MD' : 'ro-MD', { timeZone: 'Europe/Chisinau', dateStyle: 'long', timeStyle: 'short' }) : pending ? t('maib.notPaid') : '—'}</dd></div>
          <div><dt className="font-medium text-gray-900">{t('maib.quantity')}</dt><dd className="mt-1 text-gray-500">{order.quantity}</dd></div>
          {order.refunded_minor > 0 && <div><dt className="font-medium text-gray-900">{t('maib.result.refundedAmount')}</dt><dd className="mt-1 text-gray-500">{(order.refunded_minor / 100).toLocaleString(lang === 'en' ? 'en-GB' : lang === 'ru' ? 'ru-MD' : 'ro-MD')} {order.currency_code}</dd></div>}
        </dl>
        <ul className="mt-5 space-y-3 border-t border-gray-100 pt-4 text-sm">
          {Object.entries(order.grants || {}).filter(([feature]) => MAIB_FEATURE_LABELS[feature]).map(([feature, count]) => <li key={feature}>
            <p className="font-medium text-gray-900">{t(MAIB_FEATURE_LABELS[feature])} · {t('maib.uses', { count })}</p>
            <p className="mt-1 text-gray-500">{t(`maib.service.${feature}`)}</p>
          </li>)}
        </ul>
      </div>
    </details>}
  </section>;
}

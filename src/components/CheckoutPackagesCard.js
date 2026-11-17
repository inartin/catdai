import Link from 'next/link';
import { useTranslation } from '@/context/LanguageContext';
import { MAIB_MAX_PRICING_SAVINGS_LABEL } from '@/lib/maib/products.mjs';
import { paymentAppLink } from '@/lib/payment-urls.mjs';

export default function CheckoutPackagesCard({ showSavings }) {
  const { t } = useTranslation();
  const [beforeSavings, afterSavings] = t('payment.checkoutPackagesSavings').split('{savings}');

  return (
    <aside className="mt-5 flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true">
        <path d="M20 13 13 20a2 2 0 0 1-2.8 0L3 12.8V3h9.8L20 10.2a2 2 0 0 1 0 2.8Z" />
        <circle cx="7.5" cy="7.5" r="1" />
      </svg>
      <div>
        <h2 className="font-medium text-gray-950">{t('payment.checkoutPackagesTitle')}</h2>
        {showSavings && <p className="mt-1 text-sm text-gray-600">
          {beforeSavings}
          <strong className="font-bold text-emerald-700">
            {t('payment.checkoutPackagesSavingsAmount', { percent: MAIB_MAX_PRICING_SAVINGS_LABEL })}
          </strong>
          {afterSavings}
        </p>}
        <Link href={paymentAppLink('/pricing')} className="mt-1 inline-flex items-center gap-1.5 rounded text-sm font-medium text-emerald-700 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
          <span className="underline underline-offset-4">{t('payment.checkoutPackagesLink')}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { useTranslation } from '@/context/LanguageContext';
import { ArrowRight } from '@/components/icons/ArrowsIcons';
import styles from './LandingBuyRent.module.css';

export default function LandingBuyRent() {
  const { t, lang } = useTranslation();
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-GB' : 'ro-MD';
  const money = (amount) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
  return <section className={styles.section} aria-labelledby="landing-buy-rent-title">
    <div className={styles.inner}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{t('landing.buyRentEyebrow')}</p>
        <h2 id="landing-buy-rent-title">{t('landing.buyRentTitle')}</h2>
        <p className={styles.description}>{t('landing.buyRentDescription')}</p>
        <ul className={styles.features}>
          {['Monthly', 'Budget', 'Repair'].map((key) => <li key={key}><span aria-hidden="true">✓</span>{t(`landing.buyRent${key}`)}</li>)}
        </ul>
        <Link href={`/${lang}/cumparare-sau-chirie`} className={styles.cta}>{t('landing.buyRentCta')}<ArrowRight size={18} /></Link>
        <p className={styles.free}>{t('landing.buyRentFree')}</p>
      </div>
      <div className={styles.visual}>
        <div className={styles.receipt}>
          <div className={styles.receiptTop}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 4h16v25l-4-2-4 2-4-2-4 2V4Z"/><path d="M12 10h8M12 15h8M12 20h4"/></svg>
            <span>{t('landing.buyRentRentLabel')}</span>
          </div>
          <div className={styles.equation}><strong>{money(500)}</strong><span>×</span><strong>20 <small>{t('landing.buyRentYears')}</small></strong></div>
          <div className={styles.equationLabels}><span>{t('landing.buyRentPerMonth')}</span><span>{t('landing.buyRentPeriod')}</span></div>
          <div className={styles.total}><span>{t('landing.buyRentTotal')}</span><strong>{money(120000)}</strong></div>
          <p className={styles.assumption}>{t('landing.buyRentExample')}</p>
        </div>
        <div className={styles.bridge} aria-hidden="true"><span />↓<span /></div>
        <div className={styles.homeCard}>
          <div className={styles.homeIcon}><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 22 19-16 19 16M11 18v24h26V18M20 42V28h8v14M18 21h1M29 21h1"/></svg></div>
          <p>{t('landing.buyRentAlternative')}</p>
        </div>
      </div>
    </div>
  </section>;
}

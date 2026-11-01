'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/context/LanguageContext';
import { BUY_RENT_STORAGE_KEY, BUY_RENT_DEFAULTS } from '@/lib/buy-rent';
import { buyRentCopy } from '@/lib/buy-rent-copy';

export default function BuyRentEstimateAction({ data }) {
  const { lang } = useTranslation();
  const [failed, setFailed] = useState(false);
  const c = buyRentCopy[lang] || buyRentCopy.ro;
  const value = Number(data.estimate?.market_rate);
  if (!(data.full_access === true || data.access_tier === 'paid') || !Number.isFinite(value) || value <= 0) return null;
  const kind = data.estimate_type === 'rent' ? 'rent' : 'price';
  const importEstimate = () => {
    try {
      let saved = {};
      try { saved = JSON.parse(sessionStorage.getItem(BUY_RENT_STORAGE_KEY)) || {}; } catch { /* Start a fresh draft if corrupted. */ }
      const values = { ...BUY_RENT_DEFAULTS, ...saved.values, [kind]: Math.round(value) };
      if (kind === 'price') values.down = Math.min(Number(values.down), values.price);
      const sources = { ...saved.sources, [kind]: {
        kind: 'market', value: values[kind], importedAt: new Date().toISOString(),
        count: data.valuation_evidence?.comparable_count ?? data.market_stats?.comparable_count,
        observedTo: data.valuation_evidence?.observed_to || null,
        input: data.input || {},
      } };
      const targetLang = ['ro', 'ru', 'en'].includes(saved.lang) ? saved.lang : lang;
      sessionStorage.setItem(BUY_RENT_STORAGE_KEY, JSON.stringify({ values, sources, lang: targetLang, mode: kind === 'rent' && saved.mode === 'afford' ? 'afford' : 'compare' }));
      window.location.assign(`/${targetLang}/cumparare-sau-chirie`);
    } catch { setFailed(true); }
  };
  return <div className="order-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-sm">
    <button type="button" onClick={importEstimate} className="font-semibold text-emerald-800 underline underline-offset-4">{c.importAction} →</button>
    {failed && <p role="alert" className="mt-2 text-gray-600">{c.importError} <Link href={`/${lang}/cumparare-sau-chirie`} className="underline">{c.open}</Link></p>}
  </div>;
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/LanguageContext';
import AuthOptions from '@/components/AuthOptions';
import { consumeGuestAccountPrompt, featureResultPath } from '@/lib/guest-checkout.mjs';

export default function GuestAccountPrompt() {
  return <Suspense fallback={null}><GuestAccountPromptContent /></Suspense>;
}

function GuestAccountPromptContent() {
  const { session, isGuest, guestUpgradeError, retryGuestUpgrade } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resultPath = featureResultPath(`${pathname}?${searchParams}`);

  if (guestUpgradeError) return <aside role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
    {t('payment.guestLinkError')} <button type="button" onClick={retryGuestUpgrade} className="ml-3 font-semibold underline">{t('maib.refresh')}</button>
  </aside>;
  if (!isGuest || !session?.user?.id || !resultPath) return null;
  return <ResultAccountPrompt key={`${session.user.id}:${resultPath}`} userId={session.user.id} resultPath={resultPath} />;
}

function ResultAccountPrompt({ userId, resultPath }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    // Defer consumption so React's development effect replay cannot consume it unseen.
    Promise.resolve().then(() => {
      if (active) setVisible(consumeGuestAccountPrompt(userId, resultPath));
    });
    return () => { active = false; };
  }, [userId, resultPath]);

  if (!visible) return null;
  return <aside className="border-b border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950">
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
      <p className="min-w-48 flex-1">{t('payment.guestCreateAccountNotice')}</p>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">{t('payment.guestCreateAccount')}</button>
      <button type="button" onClick={() => setVisible(false)} className="cursor-pointer px-2 py-2 underline">{t('payment.guestLater')}</button>
    </div>
    {open && <AuthOptions className="mx-auto mt-4 max-w-sm" />}
  </aside>;
}

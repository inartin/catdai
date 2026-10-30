'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/context/LanguageContext';
import AuthOptions from '@/components/AuthOptions';
import { featureResultPath } from '@/lib/guest-checkout.mjs';

export default function GuestAccountPrompt() {
  const { session, isGuest, guestUpgradeError, retryGuestUpgrade } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [paidUserId, setPaidUserId] = useState(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isResult = Boolean(featureResultPath(pathname));
  useEffect(() => {
    if (!isGuest || !isResult || !session?.access_token) return;
    let active = true;
    fetch('/api/profile/credits', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.sharedCredits?.totalGranted > 0) setPaidUserId(session.user.id); })
      .catch(() => {});
    return () => { active = false; };
  }, [isGuest, isResult, session?.access_token, session?.user?.id]);

  if (guestUpgradeError) return <aside role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
    {t('payment.guestLinkError')} <button type="button" onClick={retryGuestUpgrade} className="ml-3 font-semibold underline">{t('maib.refresh')}</button>
  </aside>;
  if (!isGuest || !isResult || paidUserId !== session?.user?.id || dismissed) return null;
  return <aside className="border-b border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-950">
    <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
      <p className="min-w-48 flex-1">{t('payment.guestCreateAccountNotice')}</p>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">{t('payment.guestCreateAccount')}</button>
      <button type="button" onClick={() => setDismissed(true)} className="cursor-pointer px-2 py-2 underline">{t('payment.guestLater')}</button>
    </div>
    {open && <AuthOptions className="mx-auto mt-4 max-w-sm" />}
  </aside>;
}

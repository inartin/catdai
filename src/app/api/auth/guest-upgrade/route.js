import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requestUser, sameOrigin } from '@/lib/maib/http';
import { rateLimit } from '@/lib/rate-limit';
import { GUEST_UPGRADE_COOKIE, GUEST_UPGRADE_MAX_AGE, createGuestUpgradeCookie, readGuestUpgradeCookie } from '@/lib/guest-upgrade-cookie.mjs';

const limiter = rateLimit({ interval: 60_000, limit: 20 });

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/' };
  try {
    const response = NextResponse.json({ ok: true });
    if (user.is_anonymous === true) {
      const { error } = await supabaseAdmin.from('guest_checkout_accounts').upsert({ guest_user_id: user.id }, { onConflict: 'guest_user_id', ignoreDuplicates: true });
      if (error) throw error;
      response.cookies.set(GUEST_UPGRADE_COOKIE, createGuestUpgradeCookie(user.id), { ...cookieOptions, maxAge: GUEST_UPGRADE_MAX_AGE });
      return response;
    }
    const proof = request.cookies.get(GUEST_UPGRADE_COOKIE)?.value;
    if (!proof) return response;
    const guestId = readGuestUpgradeCookie(proof);
    if (!guestId) return NextResponse.json({ error: 'Guest session could not be verified.' }, { status: 403 });
    const { error } = await supabaseAdmin.rpc('claim_guest_checkout', { p_guest_id: guestId, p_user_id: user.id });
    if (error) throw error;
    response.cookies.set(GUEST_UPGRADE_COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    console.error('[guest-upgrade]', error.code || error.name);
    return NextResponse.json({ error: 'Your guest purchases could not be linked. Please retry.' }, { status: 503 });
  }
}

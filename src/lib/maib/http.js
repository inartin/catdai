import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCanonicalSiteUrl } from '@/lib/seo';
export const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function requestUser(request) {
  const match = /^Bearer (.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(match[1]);
  return error ? null : data?.user;
}
export function paymentOrigin() {
  const url = new URL(process.env.MAIB_PUBLIC_URL || getCanonicalSiteUrl());
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('MAIB_PUBLIC_URL must use HTTPS');
  return url.origin;
}
export function sameOrigin(request) {
  return [new URL(request.url).origin, paymentOrigin()].includes(request.headers.get('origin'));
}
export function paymentError(error) {
  console.error('[maib]', error.code || error.name || 'payment_error');
  const schemaMissing = ['42P01','42703','42883','PGRST202','PGRST204','PGRST205'].includes(error.code);
  return NextResponse.json({ error: schemaMissing ? 'Payment setup incomplete. Apply db/maib_payments.sql.' : 'Payment could not be confirmed. Please check its status before retrying.' }, { status: schemaMissing ? 503 : 502 });
}

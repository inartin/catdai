import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveAccessTier } from '@/lib/access-tier';
import { NextResponse } from 'next/server';
import { ORDER_COLUMNS, normalizePaymentOrder, encodePaymentCursor, decodePaymentCursor, applyPaymentCursor } from '@/lib/payment-history';
export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) return NextResponse.json({ transactions: [], nextCursor: null });
  const params = new URL(request.url).searchParams;
  let cursor;
  try { cursor = decodePaymentCursor(params.get('cursor')); } catch { return NextResponse.json({ error: 'invalid_cursor' }, { status: 400 }); }
  const requested = Number(params.get('limit'));
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 30) : 10;
  const { data, error } = await applyPaymentCursor(supabaseAdmin.from('payment_orders_all').select(ORDER_COLUMNS).eq('user_id', access.user_id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).order('provider', { ascending: false }).limit(limit + 1), cursor);
  if (error) return NextResponse.json({ error: 'Payment history unavailable.' }, { status: 503 });
  const rows = (data || []).slice(0, limit);
  return NextResponse.json({ transactions: rows.map(normalizePaymentOrder), nextCursor: data.length > limit ? encodePaymentCursor(rows.at(-1)) : null });
}

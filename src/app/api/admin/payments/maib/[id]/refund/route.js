import { NextResponse } from 'next/server';
import { requireAdminApiAuth } from '@/lib/admin-auth';
import { checked, getOrder, publicOrder, reconcileOrder, requestFullRefund } from '@/lib/maib/service.mjs';
import { UUID, paymentError, sameOrigin } from '@/lib/maib/http';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
export async function POST(request, context) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!UUID.test(id) || !reason || reason.length > 500) return NextResponse.json({ error: 'Order and refund reason (1–500 characters) required.' }, { status: 400 });
  try {
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found in the active MAIB environment.' }, { status: 404 });
    const refund = await requestFullRefund(order, reason);
    return NextResponse.json({ refund }, { status: 202 });
  } catch (error) {
    if (error.code === '23505' || error.code === 'P0001') return NextResponse.json({ error: 'A refund already exists or this order is not refundable.' }, { status: 409 });
    return paymentError(error);
  }
}
export async function GET(request, context) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  try {
    const order = await getOrder(id);
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    const updated = await reconcileOrder(order);
    const refunds = await checked(db.from('maib_refund_attempts').select('id,status,amount_minor,reason,created_at').eq('order_id', id).order('created_at', { ascending: false }));
    return NextResponse.json({ order: publicOrder(updated), refunds });
  } catch (error) { return paymentError(error); }
}

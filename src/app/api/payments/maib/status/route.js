import { NextResponse } from 'next/server';
import { getOrder, publicOrder, reconcileOrder } from '@/lib/maib/service.mjs';
import { requestUser, UUID, paymentError } from '@/lib/maib/http';
import { rateLimit } from '@/lib/rate-limit';
const limiter = rateLimit({ interval: 60_000, limit: 30 });
export async function GET(request) {
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('order_id');
  if (!UUID.test(id || '')) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  try {
    let order = await getOrder(id, user.id);
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    let verificationPending = false;
    try { order = await reconcileOrder(order); } catch { verificationPending = true; }
    return NextResponse.json({ ...publicOrder(order), verification_pending: verificationPending }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return paymentError(error); }
}

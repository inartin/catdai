import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payment-provider';
import { getEvaluationPurchaseOffer } from '@/lib/payment-products';
import { environment } from '@/lib/maib/client.mjs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return NextResponse.json({
    provider: getPaymentProvider(),
    environment: environment(),
    evaluationOffers: {
      sale: getEvaluationPurchaseOffer('sale_estimate'),
      rent: getEvaluationPurchaseOffer('rent_estimate'),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

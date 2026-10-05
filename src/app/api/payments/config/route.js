import { NextResponse } from 'next/server';
import { getPaymentProvider } from '@/lib/payment-provider';
import { environment } from '@/lib/maib/client.mjs';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ provider: getPaymentProvider(), environment: environment() }, { headers: { 'Cache-Control': 'no-store' } }); }

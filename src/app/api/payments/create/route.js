import { getPaymentProvider } from '@/lib/payment-provider';
import { POST as maib } from '../maib/create/route';
import { POST as paddle } from '../paddle/create/route';
export async function POST(request) { return getPaymentProvider() === 'maib' ? maib(request) : paddle(request); }

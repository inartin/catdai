import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAddressCatalogue } from '@/lib/cadastru-address-options';
import { resolveSupportedCity } from '@/lib/cadastru-streets/supported-cities';

const catalogues = new Map();

export async function GET(request) {
  const city = resolveSupportedCity(new URL(request.url).searchParams.get('city'));
  if (!city) return NextResponse.json({ error: 'invalid_city' }, { status: 400 });
  if (!catalogues.has(city)) {
    const data = getAddressCatalogue(city);
    const version = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
    catalogues.set(city, { ...data, version });
  }
  const data = catalogues.get(city);
  const headers = { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400', ETag: `"${data.version}"` };
  if (request.headers.get('if-none-match') === headers.ETag) {
    return new Response(null, { status: 304, headers });
  }
  return NextResponse.json(data, { headers });
}

import { NextResponse, after } from 'next/server';
import { createStreetOptionLookup, resolveTypedStreet } from '@/lib/cadastru-address-options';
import { resolveSupportedCity } from '@/lib/cadastru-streets/supported-cities';
import { getSharedCache, setSharedCache } from '@/lib/cache';
import { fetchExternalHouseSuggestions, fetchExternalStreetSuggestions } from '@/lib/cadastru-external-api';
import { getPrefetchedHouseNumbers } from '@/lib/prefetched-house-numbers';
import { createHouseSuggestionCache } from '@/lib/house-suggestion-cache';
// Successful inventories are shared; old workers may not yet expose the suggestion route.
const houses = createHouseSuggestionCache({ read: getSharedCache, write: setSharedCache, fetchNumbers: fetchExternalHouseSuggestions, seed: getPrefetchedHouseNumbers });
const lookupStreets = createStreetOptionLookup({read:getSharedCache, write:setSharedCache, fetchStreets:fetchExternalStreetSuggestions});
const buckets = new Map();
export async function GET(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const time = Date.now();
  for (const [key,value] of buckets) if (value.until <= time) buckets.delete(key);
  const bucket = buckets.get(ip) || { count: 0, until: time+60000 };
  if (++bucket.count > 90 || buckets.size > 10000) return NextResponse.json({error:'rate_limited'}, {status:429});
  buckets.set(ip,bucket);
  const params = new URL(request.url).searchParams;
  const city = resolveSupportedCity(params.get('city'));
  const q = (params.get('q') || '').trim();
  if (!city || q.length < (params.get('resolve') === '1' ? 1 : 2) || q.length > 80) return NextResponse.json({error:'invalid_query'}, {status:400});
  const options = await lookupStreets(city,q);
  if (params.get('resolve') === '1') return NextResponse.json(resolveTypedStreet(q,options), {headers:{'Cache-Control':'no-store'}});
  if (params.get('houses') === '1') {
    const chosen = options.find(row => row.street === q && row.road_type === params.get('road_type'));
    if (!chosen) return NextResponse.json({error:'invalid_street'}, {status:400});
    return NextResponse.json(await houses({city, street:chosen.street, road_type:chosen.road_type},after), {headers:{'Cache-Control':'no-store'}});
  }
  return NextResponse.json({ streets: options, attribution:options.some(row => row.source === 'mapmd') ? '© map.md' : '© OpenStreetMap contributors' }, {headers:{'Cache-Control':'no-store'}});
}

import { parseStreetInput } from './cadastru-street-input';
import snapshot from './cadastru-streets/data/streets.json';
import prefetched from './cadastru-streets/data/chisinau-addresses.json';
import corrections from './cadastru-streets/data/street-corrections.json';
import { normalizeStreetName, resolveStreet } from './cadastru-streets/street-resolver';
import { resolveSupportedCity } from './cadastru-streets/supported-cities';
import { houseSuggestionKey, matchStreetOptions } from './cadastru-street-matching';
import { getPrefetchedHouseNumbers } from './prefetched-house-numbers';
const types = { strada:'strada', bulevard:'bulevard', str: 'strada', bd: 'bulevard', 'str-la': 'str-la', sos: 'sos' };
const labels = { strada:'Strada', bulevard:'Bulevardul', str: 'Strada', bd: 'Bulevardul', 'str-la': 'Stradela', sos: 'Șoseaua' };
const entriesByCity = new Map();
for (const row of [...snapshot.streets, ...corrections, ...prefetched.streets.map(row => ({ ...row, city: prefetched.city }))]) {
  const city = resolveSupportedCity(row.city);
  if (!city || !types[row.road_type]) continue;
  const resolved = resolveStreet({ city, roadType: row.road_type, street: row.street, exactOnly: true });
  const street = resolved.status === 'exact' ? resolved.street : row.street;
  const option = {
    street, road_type: types[row.road_type], label: `${labels[row.road_type]} ${row.provider_street || street}`,
    normalizedNames: [...new Set([street, row.street, ...(row.aliases || [])].map(normalizeStreetName))],
    ...(row.sources?.includes('mapmd') ? { source: 'mapmd' } : {}),
  };
  if (!entriesByCity.has(city)) entriesByCity.set(city, new Map());
  const entries = entriesByCity.get(city);
  const key = houseSuggestionKey(option);
  const previous = entries.get(key);
  const preferred = previous?.source === 'mapmd' && option.source !== 'mapmd' ? previous : option;
  entries.set(key, { ...preferred,
    normalizedNames: [...new Set([...(previous?.normalizedNames || []), ...option.normalizedNames])],
  });
}
for (const [city, entries] of entriesByCity) entriesByCity.set(city, [...entries.values()]);

export function streetOptions(city, query) {
  return matchStreetOptions(entriesByCity.get(city) || [], query);
}

export function getAddressCatalogue(city) {
  const streets = entriesByCity.get(city) || [];
  const houses = {};
  if (city === prefetched.city) {
    for (const row of streets) {
      const key = houseSuggestionKey(row);
      const inventory = getPrefetchedHouseNumbers({ city, ...row });
      if (inventory) houses[key] = { numbers: inventory.numbers, fetchedAt: inventory.fetchedAt, attribution: inventory.attribution };
    }
  }
  return { city, streets, houses };
}

// The OSM catalogue is partial. Missing suggestions can come from a locality-scoped
// map.md search, without adding provider names to the official identity resolver.
export function createStreetOptionLookup({ read, write, fetchStreets }) {
  const pending = new Map();
  async function providerOptions(city, query) {
    const key = `catdai:street-suggestions:v1:${JSON.stringify([city, normalizeStreetName(query)])}`;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const cached = (await read(key))?.value;
      if (cached?.city === city && Array.isArray(cached.streets)) return cached.streets;
      const data = await fetchStreets({city, query});
      if (data?.city !== city || !Array.isArray(data.streets)) return [];
      const labels = {strada:'Strada', bulevard:'Bulevardul', 'str-la':'Stradela', sos:'Șoseaua'};
      const seen = new Set();
      const streets = data.streets.filter(row => {
        if (!row || !labels[row.road_type] || typeof row.street !== 'string' || !row.street.trim() || row.street.length > 80) return false;
        const id = `${row.road_type}:${normalizeStreetName(row.street)}`;
        if (seen.has(id)) return false;
        seen.add(id); return true;
      }).slice(0,12).map(row => ({street:row.street, road_type:row.road_type, label:`${labels[row.road_type]} ${row.provider_street || row.street}`, source:'mapmd'}));
      // Cache successful searches for 30 days; empty responses briefly, never outages.
      await write(key, {city, streets}, streets.length ? 30*86400 : 60);
      return streets;
    })();
    pending.set(key,task);
    try { return await task; } finally { pending.delete(key); }
  }
  return async (city, query) => {
    const local = streetOptions(city, query);
    if (local.length) return local;
    try {
      const streets = await providerOptions(city,query);
      if (streets.length) return streets;
      const pasted = query.trim().match(/^(.*?)\s+(?:nr\.?\s*)?(\d{1,4}(?:[a-z]|\/(?:\d{1,4}|[a-z]))?)$/i);
      if (pasted && normalizeStreetName(pasted[1]).length >= 2) {
        return (await providerOptions(city,pasted[1])).map(row => ({...row,house_number:pasted[2].toUpperCase(),label:`${row.label} ${pasted[2].toUpperCase()}`}));
      }
      return [];
    } catch { return []; }
  };
}


export function resolveTypedStreet(query, options) {
  const parsed=parseStreetInput(query);
  const name=normalizeStreetName(parsed.street);
  const exact=options.filter(option=>(!parsed.road_type || parsed.road_type===option.road_type)
    && (option.rank===0 || normalizeStreetName(option.street)===name));
  if(exact.length>1)return {status:'ambiguous',choices:exact};
  if(exact.length===1) {
    const option=exact[0];
    // Keep embedded houses for the existing API conflict checks, rather than
    // overwriting the user's separate house field during street resolution.
    return {status:'exact',address:{street:option.street+(option.house_number?` ${option.house_number}`:''),road_type:option.road_type}};
  }
  return {status:'unresolved',address:{street:parsed.street,road_type:parsed.road_type||'strada'}};
}

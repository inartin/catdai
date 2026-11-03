import snapshot from './cadastru-streets/data/streets.json';
import prefetched from './cadastru-streets/data/chisinau-addresses.json';
import corrections from './cadastru-streets/data/street-corrections.json';
import { normalizeStreetName } from './cadastru-streets/street-resolver';
import { resolveSupportedCity } from './cadastru-streets/supported-cities';
const types = { strada:'strada', bulevard:'bulevard', str: 'strada', bd: 'bulevard', 'str-la': 'str-la', sos: 'sos' };
const labels = { strada:'Strada', bulevard:'Bulevardul', str: 'Strada', bd: 'Bulevardul', 'str-la': 'Stradela', sos: 'Șoseaua' };
const entries = [...snapshot.streets, ...corrections, ...prefetched.streets.map(row=>({...row,city:prefetched.city}))].map(row => ({...row,
  canonicalCity: resolveSupportedCity(row.city),
  normalizedNames: [row.street, ...(row.aliases || [])].map(normalizeStreetName),
}));
export function streetOptions(city, query) {
  const q = normalizeStreetName(query);
  if (q.length < 2) return [];
  const found = new Map();
  for (const row of entries) {
    if (row.canonicalCity !== city || !types[row.road_type]) continue;
    const names = row.normalizedNames;
    if (!names.some(n => n.includes(q))) continue;
    const key = `${types[row.road_type]}:${normalizeStreetName(row.street)}`;
    found.set(key, { street: row.street, road_type: types[row.road_type], label: `${labels[row.road_type]} ${row.provider_street || row.street}`,
      ...(row.sources?.includes('mapmd') ? {source:'mapmd'} : {}),
      rank: names.includes(q) ? 0 : names.some(n => n.startsWith(q)) ? 1 : 2 });
  }
  if (!found.size) {
    const pasted = query.trim().match(/^(.*?)\s+(?:nr\.?\s*)?(\d{1,4}(?:[a-z]|\/(?:\d{1,4}|[a-z]))?)$/i);
    if (pasted && normalizeStreetName(pasted[1]).length >= 2) {
      return streetOptions(city,pasted[1]).map(option => ({...option, house_number:pasted[2].toUpperCase(), label:`${option.label} ${pasted[2].toUpperCase()}`}));
    }
  }
  return [...found.values()].sort((a,b) => a.rank-b.rank || Number(b.source==='mapmd')-Number(a.source==='mapmd') || a.label.localeCompare(b.label, 'ro')).slice(0, 12);
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

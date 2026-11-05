import catalogue from './cadastru-streets/data/chisinau-addresses.json';
import { normalizeStreetName, resolveStreet } from './cadastru-streets/street-resolver';
const types={str:'strada',bd:'bulevard',strada:'strada',bulevard:'bulevard','str-la':'str-la',sos:'sos'};
function canonicalName(street, roadType) {
  const resolved = resolveStreet({ city: catalogue.city, roadType, street, exactOnly: true });
  return normalizeStreetName(resolved.status === 'exact' ? resolved.street : street);
}
const entries=catalogue.streets.map(row=>({...row,canonical:canonicalName(row.street,row.road_type),
  fetchedAt:Date.parse(row.fetched_at),names:new Set([row.street,...(row.aliases||[])].map(normalizeStreetName))}));
export function getPrefetchedHouseNumbers(input) {
  if(input.city!==catalogue.city)return null;
  const original=normalizeStreetName(input.street);
  const name=canonicalName(input.street,input.road_type);
  const matches=entries.filter(row=>row.road_type===types[input.road_type] && (row.canonical===name || row.names.has(original)));
  if(new Set(matches.map(row=>row.canonical)).size!==1)return null;
  const usable=matches.filter(row=>row.numbers.length && Number.isFinite(row.fetchedAt))
    .sort((a,b)=>Number(b.primary_source==='mapmd')-Number(a.primary_source==='mapmd') || b.fetchedAt-a.fetchedAt);
  if(!usable.length)return null;
  const preferred=usable[0];
  const numbers=[...new Set(usable.flatMap(row=>row.numbers))].sort((a,b)=>a.localeCompare(b,'ro',{numeric:true}));
  return {numbers,attribution:catalogue.attribution,primary_source:preferred.primary_source,
    source_fetched_at:preferred.source_fetched_at,fetchedAt:preferred.fetchedAt};
}

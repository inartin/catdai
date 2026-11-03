import catalogue from './cadastru-streets/data/chisinau-addresses.json';
import { normalizeStreetName } from './cadastru-streets/street-resolver';
const types={str:'strada',bd:'bulevard',strada:'strada',bulevard:'bulevard','str-la':'str-la',sos:'sos'};
const entries=catalogue.streets.map(row=>({...row,names:new Set([row.street,...(row.aliases||[])].map(normalizeStreetName))}));
export function getPrefetchedHouseNumbers(input) {
  if(input.city!==catalogue.city)return null;
  const name=normalizeStreetName(input.street);
  const matches=entries.filter(row=>row.road_type===types[input.road_type] && row.names.has(name));
  if(matches.length!==1 || !matches[0].numbers.length)return null;
  const fetchedAt=Date.parse(matches[0].fetched_at);
  if(!Number.isFinite(fetchedAt))return null;
  return {numbers:matches[0].numbers,attribution:catalogue.attribution,primary_source:matches[0].primary_source,source_fetched_at:matches[0].source_fetched_at,fetchedAt};
}

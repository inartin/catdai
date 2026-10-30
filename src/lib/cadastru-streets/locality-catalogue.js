import catalogue from "./data/localities.json";

export const LOCALITIES = catalogue.localities;
export function normalizeLocality(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ş/g,'s').replace(/ţ/g,'t').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
const byCity = new Map(LOCALITIES.map(x => [normalizeLocality(x.city), x]));
// Registry/geocoder region labels differ from CUATM's full administrative title.
// These aliases identify an ancestor, never a settlement on their own.
const administrativeAliases = new Map([
 [normalizeLocality('Unitatea Teritorială Autonomă Găgăuzia'), ['Găgăuzia', 'Гагаузия']],
]);
const byName = new Map();
for (const row of LOCALITIES) for (const name of new Set([row.ro,row.ru])) {
 const key=normalizeLocality(name); const entries=byName.get(key)||[];
 if (!entries.includes(row)) entries.push(row); byName.set(key, entries);
}
export function localityCandidates(value) { return byName.get(normalizeLocality(value)) || []; }
// CUATM: towns/municipalities are urban; villages can belong to a town or commune.
const settlementStatuses = { urban: new Set(['3', '5']), rural: new Set(['6', '8', '9']) };
export function resolveLocality(value, context = '', settlementType = '') {
 const direct=byCity.get(normalizeLocality(value));
 const candidates=localityCandidates(value);
 const matchesType=row => !settlementType || settlementStatuses[settlementType]?.has(row.status);
 if (!context && direct) return matchesType(direct) ? direct.city : null;
 if (candidates.length===1) return matchesType(candidates[0]) ? candidates[0].city : null;
 const normalized=' '+normalizeLocality(context)+' ';
 const matches=candidates.filter(row => matchesType(row) && row.ancestors.length && row.ancestors.every(a =>
  [a.ro,a.ru,...(administrativeAliases.get(normalizeLocality(a.ro)) || [])]
   .some(n => normalized.includes(' '+normalizeLocality(n)+' '))));
 return matches.length===1 ? matches[0].city : null;
}
export function localityAliases(city) {const row=byCity.get(normalizeLocality(city));return row ? [row.ro,row.ru,row.city] : [];}

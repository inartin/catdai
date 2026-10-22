import catalogue from "./data/localities.json";

export const LOCALITIES = catalogue.localities;
export function normalizeLocality(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ş/g,'s').replace(/ţ/g,'t').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
const byCity = new Map(LOCALITIES.map(x => [normalizeLocality(x.city), x]));
const byName = new Map();
for (const row of LOCALITIES) for (const name of new Set([row.ro,row.ru])) {
 const key=normalizeLocality(name); const entries=byName.get(key)||[];
 if (!entries.includes(row)) entries.push(row); byName.set(key, entries);
}
export function localityCandidates(value) { return byName.get(normalizeLocality(value)) || []; }
export function resolveLocality(value, context = '') {
 const direct=byCity.get(normalizeLocality(value));
 const candidates=localityCandidates(value);
 if (!context && direct) return direct.city;
 if (candidates.length===1) return candidates[0].city;
 const normalized=' '+normalizeLocality(context)+' ';
 const matches=candidates.filter(row => row.ancestors.length && row.ancestors.every(a => [a.ro,a.ru].some(n => normalized.includes(' '+normalizeLocality(n)+' '))));
 return matches.length===1 ? matches[0].city : null;
}
export function localityAliases(city) {const row=byCity.get(normalizeLocality(city));return row ? [row.ro,row.ru,row.city] : [];}

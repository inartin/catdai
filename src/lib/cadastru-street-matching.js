// Suggestion matching only; official address resolution stays on the server.
export function normalizeStreetQuery(value) {
  return String(value || '').normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
    .toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^(?:stradela|str la|переулок|strada|str|bul|улица|ул|bulevardul|bulevard|bd|бульвар|бул|проспект|пр|șoseaua|soseaua|sos|шоссе|aleea|al|аллея)\s+/u, '')
    .replace(/\s+/g, ' ').replace(/\s+(?:улица|ул|бульвар|бул|проспект|пр|переулок|шоссе)$/u, '');
}

export const houseSuggestionKey = (option) => `${option.road_type}:${normalizeStreetQuery(option.street)}`;

export function matchStreetOptions(entries, query) {
  const q = normalizeStreetQuery(query);
  if (q.length < 2) return [];
  const found = new Map();
  for (const row of entries) {
    const names = row.normalizedNames;
    if (!names.some(name => name.includes(q))) continue;
    found.set(houseSuggestionKey(row), {
      street: row.street, road_type: row.road_type, label: row.label,
      ...(row.source ? { source: row.source } : {}),
      rank: names.includes(q) ? 0 : names.some(name => name.startsWith(q)) ? 1 : 2,
    });
  }
  if (!found.size) {
    const pasted = query.trim().match(/^(.*?)\s+(?:nr\.?\s*)?(\d{1,4}(?:[a-z]|\/(?:\d{1,4}|[a-z]))?)$/i);
    if (pasted && normalizeStreetQuery(pasted[1]).length >= 2) {
      return matchStreetOptions(entries, pasted[1]).map(option => ({
        ...option, house_number: pasted[2].toUpperCase(), label: `${option.label} ${pasted[2].toUpperCase()}`,
      }));
    }
  }
  return [...found.values()].sort((a, b) => a.rank - b.rank
    || Number(b.source === 'mapmd') - Number(a.source === 'mapmd')
    || a.label.localeCompare(b.label, 'ro')).slice(0, 12);
}

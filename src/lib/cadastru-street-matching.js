// Suggestion matching only; official address resolution stays on the server.
export function normalizeStreetQuery(value) {
  return String(value || '').normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
    .toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^(?:stradela|str la|переулок|strada|str|bul|улица|ул|bulevardul|bulevard|bd|бульвар|бул|проспект|пр|șoseaua|soseaua|sos|шоссе|aleea|al|аллея)\s+/u, '')
    .replace(/\s+/g, ' ').replace(/\s+(?:улица|ул|бульвар|бул|проспект|пр|переулок|шоссе)$/u, '');
}

export const houseSuggestionKey = (option) => `${option.road_type}:${normalizeStreetQuery(option.street)}`;
const numberTokens = value => value.match(/\d+/g)?.join('|') || '';

function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return Infinity;
  // Each character absent from the other word needs an edit; swaps cannot fix it.
  for (const [left, right] of [[a, b], [b, a]]) {
    let missing = 0;
    for (const letter of left) if (!right.includes(letter) && ++missing > limit) return Infinity;
  }
  let older, previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], older[j - 2] + 1);
      }
      minimum = Math.min(minimum, row[j]);
    }
    if (minimum > limit) return Infinity;
    older = previous; previous = row;
  }
  return previous[b.length];
}

function wordDistance(token, word, partial) {
  if (token === word || ((partial || /^\p{L}$/u.test(token)) && word.startsWith(token))) return 0;
  // Never repair an initial or numeric token. Short fragments use prefixes only.
  if (!/^\p{L}{4,}$/u.test(token) || !/^\p{L}{4,}$/u.test(word)) return Infinity;
  const limit = Math.min(token.length, word.length) < 6 ? 1 : 2;
  const candidates = partial ? [word, word.slice(0, token.length - 1),
    word.slice(0, token.length), word.slice(0, token.length + 1)] : [word];
  const edits = Math.min(...candidates.map(candidate => Math.abs(token.length - candidate.length) <= limit
    ? editDistance(token, candidate, limit) : Infinity));
  return edits <= limit ? edits : Infinity;
}

function nameDistance(tokens, name) {
  const words = name.split(' ');
  let best = Infinity;
  for (let start = 0; start <= words.length - tokens.length; start++) {
    let edits = 0;
    for (let i = 0; i < tokens.length; i++) {
      edits += wordDistance(tokens[i], words[start + i], i === tokens.length - 1);
      if (edits > 2) break;
    }
    best = Math.min(best, edits);
  }
  return best;
}

export function matchStreetOptions(entries, query) {
  const q = normalizeStreetQuery(query);
  if (q.length < 2 || q.length > 80) return [];
  const tokens = q.split(' ');
  const found = new Map();
  for (const row of entries) {
    const names = row.normalizedNames;
    const rank = names.includes(q) ? 0 : names.some(name => name.startsWith(q)) ? 1
      : names.some(name => name.includes(q)) ? 2 : 3 + Math.min(...names.map(name => nameDistance(tokens, name)));
    if (rank > 5) continue;
    const key = houseSuggestionKey(row);
    const option = {
      street: row.street, road_type: row.road_type, label: row.label,
      ...(row.source ? { source: row.source } : {}), rank,
    };
    const previous = found.get(key);
    const sourcePriority = Number(row.source === 'mapmd') - Number(previous?.source === 'mapmd');
    const preferred = !previous || sourcePriority > 0 || (sourcePriority === 0 && rank < previous.rank) ? option : previous;
    found.set(key, { ...preferred, rank: Math.min(rank, previous?.rank ?? Infinity) });
  }
  if (!found.size) {
    const pasted = query.trim().match(/^(.*?)\s+(?:nr\.?\s*)?(\d{1,4}(?:[a-z]|\/(?:\d{1,4}|[a-z]))?)$/i);
    if (pasted && normalizeStreetQuery(pasted[1]).length >= 2) {
      const streetNumbers = numberTokens(normalizeStreetQuery(pasted[1]));
      return matchStreetOptions(entries, pasted[1])
        .filter(option => numberTokens(normalizeStreetQuery(option.street)) === streetNumbers)
        .map(option => ({
          ...option, house_number: pasted[2].toUpperCase(), label: `${option.label} ${pasted[2].toUpperCase()}`,
        }));
    }
  }
  return [...found.values()].sort((a, b) => a.rank - b.rank
    || Number(b.source === 'mapmd') - Number(a.source === 'mapmd')
    || a.label.localeCompare(b.label, 'ro')).slice(0, 12);
}

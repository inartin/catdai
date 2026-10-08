import streets from "./cadastru-streets/data/streets.json";
import corrections from "./cadastru-streets/data/street-corrections.json";
import { normalizeStreetName, resolveStreet } from "./cadastru-streets/street-resolver.js";
import { resolveSupportedCity } from "./cadastru-streets/supported-cities.js";

const cyrillic = Object.fromEntries([
  ..."абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
].map((letter, index) => [letter, [
  "a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "i", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "ts", "ch", "sh", "shch", "", "y", "", "e", "iu", "ia",
][index]]));

// Loose spelling keys are used only for suggestions, never property identity.
function suggestionKey(value) {
  return normalizeStreetName(value).replace(/[а-яё]/g, (letter) => cyrillic[letter])
    .replace(/shch|sch/g, "sc").replace(/sh/g, "s").replace(/ch/g, "c").replace(/zh/g, "j");
}

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] !== b[j - 1]));
    }
    previous = row;
  }
  return previous[b.length];
}

const scopes = new Map();
for (const entry of [...streets.streets, ...corrections]) {
  const key = `${entry.city}|${entry.road_type}`;
  if (!scopes.has(key)) scopes.set(key, new Map());
  const scope = scopes.get(key);
  if (!scope.has(entry.street)) scope.set(entry.street, new Set());
  for (const name of [entry.street, ...(entry.aliases || [])]) scope.get(entry.street).add(suggestionKey(name));
}

export function suggestStreets({ city, roadType, street, excludeStreet = street }) {
  const type = ["str", "strada"].includes(roadType) ? "str" : ["bd", "bulevard"].includes(roadType) ? "bd" : null;
  const scope = scopes.get(`${resolveSupportedCity(city)}|${type}`);
  const query = suggestionKey(street);
  if (!scope || query.length < 4 || query.length > 80) return [];
  const tokens = query.split(" ");
  const numbers = query.match(/\d+/g)?.join("|") || "";
  const ranked = [];
  for (const [name, aliases] of scope) {
    if (normalizeStreetName(name) === normalizeStreetName(excludeStreet)) continue;
    let best = Infinity;
    for (const alias of aliases) {
      if ((alias.match(/\d+/g)?.join("|") || "") !== numbers) continue;
      const remaining = alias.split(" ");
      let score = 0;
      for (const token of tokens) {
        let cost = Infinity, index = -1;
        remaining.forEach((candidate, i) => {
          const edits = distance(token, candidate);
          const limit = /\d/.test(token) || token.length < 4 ? 0 : token.length < 6 ? 1 : 2;
          // A given-name initial can match a full word in suggestion-only ranking.
          const initial = /^\p{L}$/u.test(token) && /^\p{L}{2,}$/u.test(candidate) && candidate.startsWith(token);
          const next = initial ? 0.15 : edits <= limit ? edits / Math.max(token.length, candidate.length) : Infinity;
          if (next < cost) { cost = next; index = i; }
        });
        if (index === -1) { score = Infinity; break; }
        remaining.splice(index, 1);
        score += cost;
      }
      best = Math.min(best, score / tokens.length + remaining.length * 0.05);
    }
    if (best <= 0.38) ranked.push({ name, score: best });
  }
  return ranked.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, 3).map(({ name }) => name);
}

export function suggestRoadTypes({ city, roadType, street }) {
  const selectedType = ["str", "strada"].includes(roadType) ? "str"
    : ["bd", "bulevard"].includes(roadType) ? "bd" : roadType === "str-la" ? "str-la" : null;
  if (!selectedType || !resolveSupportedCity(city)) return [];
  if (resolveStreet({ city, roadType: selectedType, street, exactOnly: true }).status === "exact") return [];

  return ["str", "bd", "str-la"]
    .filter((type) => type !== selectedType)
    .map((type) => ({ type, match: resolveStreet({ city, roadType: type, street, exactOnly: true }) }))
    .filter(({ match }) => match.status === "exact")
    .map(({ type, match }) => ({ road_type: type === "bd" ? "bulevard" : type === "str-la" ? "str-la" : "strada",
      street: match.street }));
}

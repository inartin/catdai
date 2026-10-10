import streets from "./data/streets.json";
import corrections from "./data/street-corrections.json";
import { resolveSupportedCity } from "./supported-cities.js";

const readData = (name) => name === "streets.json" ? streets : corrections;

export function normalizeStreetName(value) {
  return String(value || "").normalize("NFD").replace(/(\p{Script=Latin})\p{M}+/gu, "$1").normalize("NFC")
    .toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    .replace(/^(?:stradela|str la|strada|str|bul|улица|ул|bulevardul|bulevard|bd|бульвар|бул|проспект|пр|șoseaua|soseaua|sos|шоссе|aleea|al|аллея)\s+/u, "")
    .replace(/\s+/g, " ");
}

function roadKey(value) {
  const key = String(value || "").toLowerCase().replace(/\.$/, "");
  if (/^(bd|bul|bulevard|bulevardul|бульвар|бул|проспект|пр)$/.test(key)) return "bd";
  if (/^(str|strada|улица|ул)$/.test(key)) return "str";
  if (/^(str-la|stradela|strădela)$/.test(key)) return "str-la";
  return key;
}

// Optimal string alignment distance: includes an adjacent-letter transposition.
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function matchesInitials(input, name) {
  const tokens = input.split(" ");
  const words = name.split(" ");
  // Keep the final name in full, preserve word order and never shorten numbers.
  if (tokens.length !== words.length || !/^\p{L}{2,}$/u.test(tokens.at(-1))) return false;
  let expanded = false;
  const matches = tokens.every((token, index) => {
    if (token === words[index]) return true;
    if (index < tokens.length - 1 && /^\p{L}$/u.test(token)
      && /^\p{L}{2,}$/u.test(words[index]) && words[index].startsWith(token)) {
      expanded = true;
      return true;
    }
    return false;
  });
  return matches && expanded;
}

export function createStreetResolver(entries) {
  const scopes = new Map();
  for (const entry of entries) {
    const city = resolveSupportedCity(entry.city);
    if (!city || !entry.street?.trim() || !["str", "bd", "str-la"].includes(entry.road_type)) {
      throw new Error("Invalid street dictionary entry");
    }
    const scopeKey = `${city}|${entry.road_type}`;
    if (!scopes.has(scopeKey)) scopes.set(scopeKey, new Map());
    const scope = scopes.get(scopeKey);
    const key = normalizeStreetName(entry.street);
    if (!scope.has(key)) scope.set(key, { street: entry.street, names: new Set() });
    for (const name of [entry.street, ...(entry.aliases || [])]) {
      const normalized = normalizeStreetName(name);
      if (normalized) scope.get(key).names.add(normalized);
    }
  }

  return ({ city, roadType, street, exactOnly = false, includeAliases = false }) => {
    const scope = scopes.get(`${resolveSupportedCity(city)}|${roadKey(roadType)}`);
    const input = normalizeStreetName(street);
    const unchanged = { status: "unresolved", street };
    if (!scope || !input) return unchanged;
    const result = (entry, status) => ({
      status,
      street: entry.street,
      ...(includeAliases ? { aliases: [...entry.names].filter((name) =>
        [...scope.values()].filter((candidate) => candidate.names.has(name)).length === 1
      ) } : {}),
    });
    const exact = [...scope.values()].filter((entry) => entry.names.has(input));
    if (exact.length === 1) return result(exact[0], "exact");
    if (exact.length > 1) return { status: "ambiguous", street, suggestions: exact.map((x) => x.street).sort() };
    if (exactOnly || input.length > 80) return unchanged;
    const initials = [...scope.values()].filter((entry) => [...entry.names].some((name) => matchesInitials(input, name)));
    if (initials.length === 1) return result(initials[0], "abbreviation");
    if (initials.length > 1) return { status: "ambiguous", street, suggestions: initials.map((x) => x.street).sort() };
    if (input.length < 6) return unchanged;
    const numbers = input.match(/\d+/g)?.join("|") || "";
    const ranked = [...scope.values()].map((entry) => ({
      street: entry.street,
      distance: Math.min(...[...entry.names].map((name) => {
        if (name.length < 6 || Math.abs(name.length - input.length) > 2 ||
          (name.match(/\d+/g)?.join("|") || "") !== numbers) return Infinity;
        return distance(input, name);
      })),
    })).filter((entry) => entry.distance <= 2).sort((a, b) => a.distance - b.distance || a.street.localeCompare(b.street));
    if (!ranked.length || ranked[0].distance > 1) return unchanged;
    // A second street within two edits makes a one-edit correction uncertain.
    if (ranked.length > 1) return { status: "ambiguous", street, suggestions: ranked.map((x) => x.street) };
    return result(scope.get(normalizeStreetName(ranked[0].street)), "typo");
  };
}

export const resolveStreet = createStreetResolver([
  ...readData("streets.json").streets,
  ...readData("street-corrections.json"),
]);

export function inspectStreetAddress({ city, roadType, street, houseNumber }) {
  const unchanged = { status: "unchanged", street };
  const leadingMarker = String(street || "").trim().match(/^(?:stradela|strădela|str-la|strada|str|bulevardul|bulevard|bd|bul)(?=[.,\s])/iu)?.[0];
  if (leadingMarker && roadKey(leadingMarker) !== roadKey(roadType)) {
    return { status: "road_type_conflict", street };
  }
  // Check complete names first: dates and numbered streets must retain their digits.
  if (resolveStreet({ city, roadType, street, exactOnly: true }).status !== "unresolved") return unchanged;
  let candidate = String(street || "").trim().replace(/[.,;]+$/, "").trim();
  const house = candidate.match(/(?:^|[\s,;])(?:nr\.?\s*)?(\d{1,4}(?:\/\d{1,4})?)$/i);
  if (house) candidate = candidate.slice(0, house.index).trim();
  const markers = { str: "strada|str|улица|ул", bd: "bulevardul|bulevard|bd|bul|бульвар|бул|проспект|пр",
    "str-la": "stradela|strădela|str-la" }[roadKey(roadType)];
  if (!markers) return unchanged;
  candidate = candidate.replace(new RegExp(`^(?:${markers})(?:[.,]\\s*|\\s+)`, "iu"), "")
    .replace(new RegExp(`[,;\\s]+(?:${markers})\\.?$`, "iu"), "")
    .replace(/^[,;\s]+|[,;\s]+$/g, "");
  const resolved = resolveStreet({ city, roadType, street: candidate, exactOnly: true });
  // A marker for another road type must not disappear through name normalization.
  if (/^(?:stradela|strădela|str-la|strada|str|bulevardul|bulevard|bd|bul|улица|ул|бульвар|бул|проспект|пр|soseaua|șoseaua|sos|шоссе|aleea|al|аллея)(?:[.,]|\s)/iu.test(candidate)) return unchanged;
  if (resolved.status !== "exact") return unchanged;
  if (house && house[1] !== houseNumber) {
    return { status: "conflict", street: resolved.street, embeddedHouseNumber: house[1],
      corrections: [house[1], houseNumber].map((number) => ({ street: resolved.street, house_number: number })) };
  }
  return { status: "cleaned", street: resolved.street };
}

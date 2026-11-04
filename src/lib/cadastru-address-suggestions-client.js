import { houseSuggestionKey, matchStreetOptions, normalizeStreetQuery } from './cadastru-street-matching';

const DAY = 86400000;
const limits = { catalogues: 6, streets: 80, houses: 80 };

export function createAddressSuggestionClient({
  fetcher = (...args) => fetch(...args), getStorage = () => globalThis.localStorage, now = Date.now,
} = {}) {
  const caches = { catalogues: new Map(), streets: new Map(), houses: new Map() };
  const loaded = new Set();
  const pendingCatalogues = new Map();
  const pendingHouses = new Map();
  const houseRetries = new Map();
  const storageKey = bucket => `catdai:address-suggestions:v1:${bucket}`;

  function cache(bucket) {
    const entries = caches[bucket];
    if (!loaded.has(bucket)) {
      loaded.add(bucket);
      try {
        const saved = JSON.parse(getStorage()?.getItem(storageKey(bucket)) || '[]');
        if (Array.isArray(saved)) for (const entry of saved.slice(-limits[bucket])) {
          if (typeof entry?.key === 'string' && entry.expiresAt > now() && entry.value) entries.set(entry.key, entry);
        }
      } catch { /* Storage may be blocked or contain an older, invalid value. */ }
    }
    return entries;
  }

  function read(bucket, key) {
    const entry = cache(bucket).get(key);
    return entry?.expiresAt > now() ? entry : undefined;
  }

  function write(bucket, key, value, ttl) {
    const entries = cache(bucket);
    entries.delete(key);
    entries.set(key, { key, value, savedAt: now(), expiresAt: now() + ttl });
    for (const [entryKey, entry] of entries) if (entry.expiresAt <= now()) entries.delete(entryKey);
    while (entries.size > limits[bucket]) entries.delete(entries.keys().next().value);
    try { getStorage()?.setItem(storageKey(bucket), JSON.stringify([...entries.values()])); } catch { /* Memory caching still works. */ }
  }

  function getCatalogue(city) {
    const value = read('catalogues', city)?.value;
    return value?.city === city && Array.isArray(value.streets) && value.houses && typeof value.version === 'string' ? value : null;
  }

  function preloadCatalogue(city) {
    if (!city) return Promise.resolve(null);
    if (pendingCatalogues.has(city)) return pendingCatalogues.get(city);
    const cached = getCatalogue(city);
    if (cached && now() - read('catalogues', city).savedAt < 300000) return Promise.resolve(cached);
    const task = (async () => {
      try {
        const response = await fetcher(`/api/cadastru/address-catalogue?${new URLSearchParams({ city })}`, {
          signal: AbortSignal.timeout(10000), cache: 'no-cache',
          headers: cached ? { 'If-None-Match': `"${cached.version}"` } : {},
        });
        if (!response.ok && response.status !== 304) throw new Error('Catalogue unavailable');
        const data = response.status === 304 ? cached : await response.json();
        if (data?.city !== city || !Array.isArray(data.streets) || !data.houses || typeof data.version !== 'string') throw new Error('Invalid catalogue');
        write('catalogues', city, data, 30 * DAY);
        return data;
      } catch { return cached; }
      finally { pendingCatalogues.delete(city); }
    })();
    pendingCatalogues.set(city, task);
    return task;
  }

  const queryKey = (city, query) => JSON.stringify([city, normalizeStreetQuery(query)]);
  function getStreetOptions(city, query) {
    const catalogue = getCatalogue(city);
    const local = catalogue ? matchStreetOptions(catalogue.streets, query) : [];
    if (local.length) return local;
    return read('streets', queryKey(city, query))?.value;
  }

  async function fetchStreetOptions(city, query, signal) {
    const cached = getStreetOptions(city, query);
    if (cached) return cached;
    const response = await fetcher(`/api/cadastru/address-options?${new URLSearchParams({ city, q: query })}`, { signal });
    if (!response.ok) throw new Error('Suggestions unavailable');
    const data = await response.json();
    const streets = Array.isArray(data.streets) ? data.streets : [];
    if (!signal?.aborted) write('streets', queryKey(city, query), streets, streets.length ? 300000 : 30000);
    return streets;
  }

  const houseKey = (city, option) => JSON.stringify([city, houseSuggestionKey(option)]);
  function getHouseNumbers(city, option) {
    const saved = read('houses', houseKey(city, option))?.value;
    const baseline = getCatalogue(city)?.houses[houseSuggestionKey(option)];
    if (!saved) return baseline;
    if (!baseline) return saved;
    return { ...saved, numbers: [...new Set([...saved.numbers, ...baseline.numbers])].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true })) };
  }

  function loadHouseNumbers(city, option, { prefetch = false } = {}) {
    const key = houseKey(city, option);
    const cached = getHouseNumbers(city, option);
    if (pendingHouses.has(key)) return pendingHouses.get(key);
    // Keep speculative hovering within the worker's small provider queue.
    if (prefetch && pendingHouses.size) return Promise.resolve(cached || { numbers: [] });
    if ((cached?.numbers?.length && now() - cached.fetchedAt < 30 * DAY) || (houseRetries.get(key) || 0) > now()) {
      return Promise.resolve(cached || { numbers: [] });
    }
    const task = (async () => {
      try {
        const response = await fetcher(`/api/cadastru/address-options?${new URLSearchParams({
          city, q: option.street, road_type: option.road_type, houses: '1',
        })}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('House suggestions unavailable');
        const data = await response.json();
        if (!Array.isArray(data.numbers) || !data.numbers.length) return cached || { numbers: [], unavailable: true };
        const sourceDate = Date.parse(data.source_fetched_at?.[data.primary_source]);
        const inventory = { numbers: data.numbers, attribution: data.attribution, fetchedAt: Number.isFinite(sourceDate) ? sourceDate : now() };
        write('houses', key, inventory, 365 * DAY);
        return getHouseNumbers(city, option);
      } catch { return cached || { numbers: [], unavailable: true }; }
      finally {
        pendingHouses.delete(key);
        if (houseRetries.size >= 80) houseRetries.delete(houseRetries.keys().next().value);
        houseRetries.set(key, now() + 300000);
      }
    })();
    pendingHouses.set(key, task);
    return task;
  }

  return { getCatalogue, preloadCatalogue, getStreetOptions, fetchStreetOptions, getHouseNumbers, loadHouseNumbers };
}

export const addressSuggestions = createAddressSuggestionClient();

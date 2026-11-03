const DAY = 86400;
export function mergeHouseInventories(...values) {
  const inventories=values.filter(value=>Array.isArray(value?.numbers)&&value.numbers.length);
  if(!inventories.length)return null;
  const source=value=>value.primary_source || (value.attribution==='© map.md'?'mapmd':null);
  const rank=value=>source(value)==='mapmd'?2:source(value)==='osm'?1:0;
  const preferred=[...inventories].sort((a,b)=>rank(b)-rank(a) || b.fetchedAt-a.fetchedAt)[0];
  const dates={};
  for(const value of inventories) {
    const sourceDates={...(value.source_fetched_at||{})};
    if(source(value) && !sourceDates[source(value)] && Number.isFinite(value.fetchedAt))sourceDates[source(value)]=new Date(value.fetchedAt).toISOString();
    for(const [key,date] of Object.entries(sourceDates))if(!dates[key]||Date.parse(date)>Date.parse(dates[key]))dates[key]=date;
  }
  const numbers=[...new Set(inventories.flatMap(value=>value.numbers))].sort((a,b)=>a.localeCompare(b,'ro',{numeric:true}));
  return {...preferred,numbers,source_fetched_at:dates,
    ...(source(preferred)?{primary_source:source(preferred)}:{}),
    attribution:dates.osm && dates.mapmd ? '© map.md · © OpenStreetMap contributors, ODbL 1.0' : preferred.attribution};
}
// Retain stale suggestions for outages; freshness is independent of retention.
export function createHouseSuggestionCache({ read, write, fetchNumbers, seed = () => null, now = Date.now }) {
  const pending = new Map();
  const retries = new Map();
  async function refresh(key, input) {
    if (pending.has(key)) return pending.get(key);
    if ((retries.get(key) || 0) > now()) return null;
    const task = (async () => {
      try {
        const data = await fetchNumbers(input);
        if (!Array.isArray(data?.numbers) || !data.numbers.length) return null;
        const fetchedAt=now();
        const value = mergeHouseInventories((await read(key))?.value, seed(input), {
          ...data, fetchedAt, primary_source:'mapmd', source_fetched_at:{mapmd:new Date(fetchedAt).toISOString()},
        });
        await write(key, value, 365 * DAY);
        return value;
      } catch { return null; }
      finally {
        if (retries.size >= 1000) retries.delete(retries.keys().next().value);
        retries.set(key, now() + 5 * 60 * 1000);
      }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  return async (input, defer) => {
    const key = `catdai:house-suggestions:v1:${JSON.stringify([input.city,input.road_type,input.street])}`;
    const cached = mergeHouseInventories((await read(key))?.value, seed(input));
    if (cached?.numbers?.length) {
      if (now() - cached.fetchedAt >= 30 * DAY * 1000) defer(() => refresh(key,input));
      return { numbers: cached.numbers, attribution: cached.attribution, primary_source:cached.primary_source, source_fetched_at:cached.source_fetched_at, stale: now()-cached.fetchedAt >= 90*DAY*1000 };
    }
    const fresh = await refresh(key,input);
    return fresh || { numbers: [], unavailable: true };
  };
}

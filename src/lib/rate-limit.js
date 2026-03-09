const stores = new Map();

export function rateLimit({ interval = 60_000, limit = 30 } = {}) {
  const key = `${interval}:${limit}`;
  if (!stores.has(key)) stores.set(key, new Map());
  const tokenStore = stores.get(key);

  return {
    check(ip) {
      const now = Date.now();
      const record = tokenStore.get(ip);

      if (!record || now - record.start > interval) {
        tokenStore.set(ip, { start: now, count: 1 });
        return { allowed: true, remaining: limit - 1 };
      }

      if (record.count >= limit) {
        const retryAfter = Math.ceil((record.start + interval - now) / 1000);
        return { allowed: false, remaining: 0, retryAfter };
      }

      record.count++;
      return { allowed: true, remaining: limit - record.count };
    },
  };
}

if (typeof globalThis.__rateLimitCleanup === "undefined") {
  globalThis.__rateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
      for (const [ip, record] of store) {
        if (now - record.start > 120_000) store.delete(ip);
      }
    }
  }, 60_000);
}

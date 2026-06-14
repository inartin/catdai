import { createClient } from "redis";

let redis = null;
let redisConnecting = null;

export function isSharedCacheConfigured() {
  return process.env.REDIS_CACHE_ENABLED !== "false";
}

async function getRedis() {
  if (!isSharedCacheConfigured()) return null;

  if (!redis) {
    redis = createClient({
      url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
      socket: {
        reconnectStrategy: false,
      },
    });

    redis.on("error", (error) => {
      console.error("[cache] Redis connection error:", error.message);
    });
  }

  if (!redis.isOpen) {
    redisConnecting ||= redis.connect().finally(() => {
      redisConnecting = null;
    });
    await redisConnecting;
  }

  return redis;
}

export async function getSharedCacheClient() {
  try {
    return await getRedis();
  } catch (error) {
    console.error("[cache] Redis client unavailable:", error.message);
    return null;
  }
}

export async function getSharedCache(key) {
  try {
    const client = await getRedis();
    if (!client) return null;

    const value = await client.get(key);
    return value == null ? null : { value: JSON.parse(value) };
  } catch (error) {
    console.error(`[cache] Redis get failed for ${key}:`, error.message);
    return null;
  }
}

export async function setSharedCache(key, value, ttlSeconds) {
  try {
    const client = await getRedis();
    if (!client) return false;

    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    return true;
  } catch (error) {
    console.error(`[cache] Redis set failed for ${key}:`, error.message);
    return false;
  }
}

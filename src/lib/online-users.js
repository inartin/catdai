import { getSharedCacheClient } from "@/lib/cache";

const ONLINE_USERS_KEY = "catdai:online-users:v1";
const ONLINE_WINDOW_MS = 90_000;

// Supplying a browser ID records a heartbeat; reading alone never adds a visitor.
export async function getOnlineUserCount(deviceId = null) {
  const client = await getSharedCacheClient();
  if (!client) throw new Error("Online users requires Redis.");

  const now = Date.now();
  const cutoff = now - ONLINE_WINDOW_MS;
  if (!deviceId) return client.zCount(ONLINE_USERS_KEY, cutoff + 1, "+inf");

  const results = await client.multi()
    .zRemRangeByScore(ONLINE_USERS_KEY, "-inf", cutoff)
    .zAdd(ONLINE_USERS_KEY, { score: now, value: deviceId })
    .expire(ONLINE_USERS_KEY, 180)
    .zCount(ONLINE_USERS_KEY, cutoff + 1, "+inf")
    .exec();
  return results.at(-1);
}

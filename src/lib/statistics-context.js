import { AsyncLocalStorage } from "node:async_hooks";
import { getRequestUser } from "@/lib/access-tier";

const statisticsContext = new AsyncLocalStorage();

export function shouldCollectStatistics() {
  return statisticsContext.getStore()?.collect !== false;
}

// Keep the decision with this request, including deferred/background writes.
// Auth is read from the server for every request, not from stale JWT metadata.
export function withStatisticsContext(handler) {
  return async function (request, ...args) {
    let collect = false;
    try {
      const { data, error } = await getRequestUser(request);
      collect = !error && data?.user?.app_metadata?.catdai_is_admin !== true;
    } catch (error) {
      console.error("[statistics] user lookup failed:", error.message);
    }
    return statisticsContext.run({ collect }, () => handler(request, ...args));
  };
}

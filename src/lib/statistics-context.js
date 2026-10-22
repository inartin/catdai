import { getRequestVisitor } from "@/lib/visitor";
import { AsyncLocalStorage } from "node:async_hooks";
import { getRequestUser } from "@/lib/access-tier";

const statisticsContext = new AsyncLocalStorage();

export function shouldCollectStatistics() {
  return statisticsContext.getStore()?.collect !== false;
}

export function getStatisticsVisitor() {
  return statisticsContext.getStore()?.visitor || null;
}

export function getStatisticsUserId() {
  return statisticsContext.getStore()?.userId || null;
}

// Keep the decision with this request, including deferred/background writes.
// Auth is read from the server for every request, not from stale JWT metadata.
export function withStatisticsContext(handler) {
  return async function (request, ...args) {
    let collect = false;
    let userId = null;
    try {
      const { data, error } = await getRequestUser(request);
      userId = data?.user?.id || null;
      collect = !error && data?.user?.app_metadata?.catdai_is_admin !== true;
    } catch (error) {
      console.error("[statistics] user lookup failed:", error.message);
    }
    return statisticsContext.run({ collect, userId, visitor: collect ? getRequestVisitor(request) : null }, () => handler(request, ...args));
  };
}

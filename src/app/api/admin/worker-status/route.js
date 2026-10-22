import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { getApiWorkers } from "@/lib/api-workers";

export const dynamic = "force-dynamic";

const metadata = (value) => typeof value === "string" ? value.slice(0, 128) : null;

async function checkWorker(worker) {
  const startedAt = Date.now();
  const result = (status, detail = null, identity = {}) => ({
    name: worker.name, url: worker.url, status, detail,
    responseTimeMs: status === "online" ? Date.now() - startedAt : null,
    checkedAt: new Date().toISOString(), ...identity,
  });
  if (!worker.url) return result("not_configured");
  try {
    const response = await fetch(new URL("/health", worker.url), {
      cache: "no-store", signal: AbortSignal.timeout(5_000), redirect: "error",
    });
    if (!response.ok) return result("offline", `HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.ok !== true) return result("offline", "Invalid health response");
    return result("online", null, {
      nodeName: metadata(payload.node_name || response.headers.get("x-catdai-node")),
      appVersion: metadata(payload.app_version || response.headers.get("x-catdai-app-version")),
      nodeVersion: metadata(payload.node_version || response.headers.get("x-catdai-node-version")),
    });
  } catch (error) {
    return result("offline", error?.name === "TimeoutError" ? "Timed out" : "Unreachable");
  }
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const workers = await Promise.all(getApiWorkers().map(checkWorker));
  return NextResponse.json({ workers, checkedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}

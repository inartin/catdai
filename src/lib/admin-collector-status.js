import crypto from "node:crypto";
import { getApiWorkers } from "@/lib/api-workers";

export async function fetchCollectorStatus() {
  const secret = process.env.CADASTRU_EXTERNAL_API_SECRET;
  const databaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secret || !databaseUrl) return { available: false };
  const body = JSON.stringify({ database_host: new URL(databaseUrl).host });
  const workers = getApiWorkers().filter(worker => worker.url);
  const results = await Promise.all(workers.map(async worker => {
    try {
      const timestamp = String(Date.now());
      const signature = crypto.createHmac("sha256", secret).update(`${timestamp}\n${body}`).digest("hex");
      const response = await fetch(new URL("/v1/collector/status", worker.url), {
        method: "POST", body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
        headers: { "Content-Type": "application/json", "X-Catdai-Timestamp": timestamp, "X-Catdai-Signature": `sha256=${signature}` },
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const data = payload?.data;
      if (payload?.ok !== true || data?.available !== true || !Number.isFinite(Date.parse(data.updatedAt))
        || !["running", "stopped", "unknown"].includes(data.state)
        || !["total", "processed", "complete", "partial", "pending", "running", "skipped"].every(key => Number.isSafeInteger(data.totals?.[key]) && data.totals[key] >= 0)
        || !["cadastru", "transport", "nearby", "reports"].every(key => Number.isSafeInteger(data.categories?.[key]?.saved) && Number.isSafeInteger(data.categories[key].missing))
        || !Array.isArray(data.retry)) return null;
      return { ...data, worker: worker.name };
    } catch { return null; }
  }));
  const available = results.filter(Boolean).sort((a, b) => Number(b.state === "running") - Number(a.state === "running")
    || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return available[0] || { available: false };
}

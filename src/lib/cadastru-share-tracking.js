import { fetchWithStatisticsAuth } from "@/lib/statistics-client";

let pendingOpen = Promise.resolve();

async function sendEvent(slug, body) {
  const response = await fetchWithStatisticsAuth(`/api/cadastru/share/${encodeURIComponent(slug)}/events`, {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.ok ? response.json() : null;
}

export function recordCadastruShareOpen(slug) {
  pendingOpen = pendingOpen.catch(() => null).then(async () => {
    const result = await sendEvent(slug, { event: "open" });
    if (result?.cookie_required) await sendEvent(slug, { event: "open" });
  }).catch(() => {});
  return pendingOpen;
}

export async function recordCadastruShareClick(slug) {
  try {
    await sendEvent(slug, { event: "share", event_id: crypto.randomUUID() });
  } catch {
    // Tracking must not interrupt copying or opening the public report.
  }
}

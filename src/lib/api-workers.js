const WORKER_NAMES = ["pi", "mac", "curiosity"];

export function getApiWorkers(primaryUrl = process.env.CADASTRU_EXTERNAL_API_BASE_URL
  || process.env.CADASTRU_EXTERNAL_API_URL || process.env.CADASTRU_EXTERNAL_ADDRESS_API_URL || "") {
  return WORKER_NAMES.map((name) => {
    const configuredUrl = process.env[`CATDAI_API_${name.toUpperCase()}_BASE_URL`]
      || (name === "pi" ? primaryUrl : "");
    let url = null;
    try {
      const parsed = new URL(configuredUrl);
      if (["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password) url = parsed.toString();
    } catch { /* Unconfigured or invalid hosts remain visible in admin status. */ }
    return { name, url };
  });
}

export function getApiWorkerEndpoints(path, explicitUrl, baseUrl = process.env.CADASTRU_EXTERNAL_API_BASE_URL || "") {
  const endpoints = getApiWorkers(baseUrl || explicitUrl || "").filter((worker) => worker.url).map((worker) => ({
    name: worker.name,
    url: worker.name === "pi" && !process.env.CATDAI_API_PI_BASE_URL && !baseUrl
      ? worker.url
      : new URL(path, worker.url.endsWith("/") ? worker.url : `${worker.url}/`).toString(),
  }));
  return endpoints.filter((worker, index) => endpoints.findIndex((other) => other.url === worker.url) === index);
}

export function isApiWorkerResponse(response, payload) {
  return Boolean(response.headers?.get("x-catdai-node"))
    || typeof payload?.ok === "boolean" || typeof payload?.error === "string";
}

async function isApiWorkerAvailable(url) {
  try {
    const response = await fetch(new URL("/health", url), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    return response.ok && (await response.json())?.ok === true;
  } catch {
    return false;
  }
}

export async function withApiWorkerFallback(workers, request) {
  for (const [index, worker] of workers.entries()) {
    try {
      return await request(worker);
    } catch (error) {
      const status = error?.status;
      const unavailable = !status || status >= 500 || (status >= 200 && status < 300);
      if (!error?.fallbackEligible || !unavailable || error.workerResponded
        || index === workers.length - 1) throw error;
      // An unanswered lookup can be waiting on a shared provider. Only move to
      // another host when this worker's independent health endpoint also fails.
      if (await isApiWorkerAvailable(worker.url)) throw error;
    }
  }
}

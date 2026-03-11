const DEVICE_KEY = "catdai-device-id";
const SESSION_KEY = "catdai-session-id";

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function computeEvaluationGroupId({ city, district, rooms_count, building_type }) {
  const raw = [city, district, rooms_count, building_type]
    .map((v) => String(v ?? ""))
    .join("|");
  return djb2(raw);
}

const LOG_ID_PREFIX = "catdai-log-";

export function getOrCreateLogId(evaluationGroupId) {
  try {
    const key = LOG_ID_PREFIX + evaluationGroupId;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

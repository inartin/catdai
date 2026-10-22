import { normalizeVisitorId } from "@/lib/visitor";

export function getDeviceId() {
  let id;
  try {
    id = normalizeVisitorId(localStorage.getItem("catdai-device-id"));
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("catdai-device-id", id);
    }
  } catch {
    return null;
  }
  // Mirror the existing ID for APIs which do not send a tracking body.
  // This contains no account data and is not an authentication cookie.
  try {
    document.cookie = `catdai-device-id=${id}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {}
  return id;
}

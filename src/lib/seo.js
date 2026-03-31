const DEFAULT_SITE_URL = "https://catdai.md";

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function normalizeUrlCandidate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function pickPreferredUrl(rawValue) {
  const candidates = String(rawValue || "")
    .split(",")
    .map((entry) => normalizeUrlCandidate(entry))
    .filter(Boolean);

  if (candidates.length === 0) return null;

  const httpsPublic = candidates.find((entry) => {
    const url = new URL(entry);
    return url.protocol === "https:" && !isLocalhostHost(url.hostname);
  });
  if (httpsPublic) return httpsPublic;

  const publicUrl = candidates.find((entry) => {
    const url = new URL(entry);
    return !isLocalhostHost(url.hostname);
  });
  if (publicUrl) return publicUrl;

  return candidates[0];
}

export function getCanonicalSiteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  return pickPreferredUrl(fromEnv) || DEFAULT_SITE_URL;
}

export function toAbsoluteUrl(pathname = "/") {
  return new URL(pathname, getCanonicalSiteUrl()).toString();
}

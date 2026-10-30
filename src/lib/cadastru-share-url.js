import { normalizeLanguage } from "./language.js";

// The database indexes this same 72-bit SHA-256 prefix for existing and new reports.
export async function getCadastruSharePath(slug, lang = "ro") {
  if (!/^[a-f0-9]{48}$/.test(slug)) throw new Error("Invalid cadastru share slug");
  const bytes = Uint8Array.from(slug.match(/../g), (byte) => parseInt(byte, 16));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const code = btoa(String.fromCharCode(...new Uint8Array(digest, 0, 9)))
    .replace(/\+/g, "-").replace(/\//g, "_");
  return `/${normalizeLanguage(lang)}/c/${code}`;
}

export function decodeCadastruShareCode(code) {
  // Keep the first compact format working without a database lookup.
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(code)) return null;
  return Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")),
    (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

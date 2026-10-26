// Encode the existing 192-bit identifier without changing saved reports or access.
export function getCadastruSharePath(slug, lang = "ro") {
  if (!/^[a-f0-9]{48}$/.test(slug)) throw new Error("Invalid cadastru share slug");
  const bytes = slug.match(/../g).map((byte) => parseInt(byte, 16));
  const code = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
  return `/${lang === "ru" ? "ru" : "ro"}/c/${code}`;
}

export function decodeCadastruShareCode(code) {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(code)) return null;
  return Array.from(atob(code.replace(/-/g, "+").replace(/_/g, "/")),
    (byte) => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

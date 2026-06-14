const MAX_HTML_BYTES = 512 * 1024;
const EXTERNAL_ID_RE = /^\d{5,12}$/;

function build999ListingUrl(externalId, language = "ro") {
  const normalizedId = String(externalId || "").trim();
  if (!EXTERNAL_ID_RE.test(normalizedId)) return null;
  const listingLang = language === "ru" ? "ru" : "ro";
  return `https://999.md/${listingLang}/${normalizedId}`;
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function getMetaTagContent(html, key, value) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const attrRegex = /([a-zA-Z_:.-]+)\s*=\s*["']([^"']*)["']/g;
    const attrs = {};
    let match;
    while ((match = attrRegex.exec(tag))) {
      attrs[match[1].toLowerCase()] = decodeHtmlAttribute(match[2]);
    }

    if (attrs[key] === value && attrs.content) {
      return attrs.content;
    }
  }

  return null;
}

function isUsefulPreviewImage(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, "https://999.md");
    return parsed.protocol === "https:" && !parsed.pathname.includes("logo-1200x650");
  } catch {
    return false;
  }
}

async function readBoundedText(res, maxBytes = MAX_HTML_BYTES) {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(buffer);
  }

  const html = await res.text();
  return new TextEncoder().encode(html).byteLength > maxBytes ? null : html;
}

export async function fetchListingPreviewImage(externalId, language) {
  const url = build999ListingUrl(externalId, language);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return null;

    const contentLength = Number(res.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) return null;

    const html = await readBoundedText(res);
    if (!html) return null;

    const imageUrl =
      getMetaTagContent(html, "property", "og:image") ||
      getMetaTagContent(html, "name", "twitter:image");

    if (!isUsefulPreviewImage(imageUrl)) return null;
    return new URL(imageUrl, "https://999.md").toString();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

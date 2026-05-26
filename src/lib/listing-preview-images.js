function build999ListingUrl(externalId, language = "ro") {
  if (!externalId) return null;
  const listingLang = language === "ru" ? "ru" : "ro";
  return `https://999.md/${listingLang}/${encodeURIComponent(String(externalId))}`;
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

    const html = await res.text();
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

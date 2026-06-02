/**
 * Server-side extraction of structured data from a 999.md listing page.
 * Only pulls the seller-selected attributes; the free-text description is ignored.
 */

const LISTING_HOST_RE = /(^|\.)999\.md$/i;
const OFFER_TYPE_LABELS = ["Tip ofertă", "Tipul ofertei"];
const OFFER_TYPE_VALUES = ["De închiriat lunar", "De închiriat pe zi", "Închiriez", "Vând"];

function decodeEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

export function extractListingIdFromUrl(url) {
  if (!url || typeof url !== "string") return null;
  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!LISTING_HOST_RE.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(/\/(\d{5,})(?:[/?#]|$)/);
  return match ? match[1] : null;
}

export function build999ListingUrl(externalId, language = "ro") {
  if (!externalId) return null;
  const listingLang = language === "ru" ? "ru" : "ro";
  return `https://999.md/${listingLang}/${encodeURIComponent(String(externalId))}`;
}

function getMetaContent(html, property) {
  const escaped = property.replace(/[.:*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]*>`, "i");
  const tag = html.match(re);
  if (!tag) return null;
  const content = tag[0].match(/content=["']([^"']*)["']/i);
  return content ? decodeEntities(content[1]) : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTitle(html) {
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : null;
}

function extractVisibleText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractInlineOfferType(html) {
  const text = extractVisibleText(html);
  const labels = OFFER_TYPE_LABELS.map(escapeRegExp).join("|");
  const values = [...OFFER_TYPE_VALUES].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const match = text.match(new RegExp(`(?:${labels})\\s*:?\\s*(${values})(?=\\s|$)`, "i"));
  return match ? match[1] : null;
}

function extractJsonLd(html) {
  const blocks = [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi),
  ];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1]);
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item && (item["@type"] === "Product" || item.name)) return item;
      }
    } catch {
      // Malformed JSON-LD block; skip it.
    }
  }
  return null;
}

function extractFeatures(html) {
  const features = {};
  const liRe = /<li class="styles_group__feature__[^"]*">([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRe.exec(html))) {
    const li = match[1];
    const keyMatch = li.match(/styles_group__key__[^"]*">([^<]*)<\/span>/i);
    if (!keyMatch) continue;
    const key = decodeEntities(keyMatch[1]).trim();
    if (!key) continue;
    let valueMatch = li.match(/styles_group__value__[^"]*">([^<]*)<\/span>/i);
    if (!valueMatch) {
      valueMatch = li.match(/styles_group__link__[^"]*"[^>]*>([^<]*)<\/a>/i);
    }
    features[key] = valueMatch ? decodeEntities(valueMatch[1]).trim() : "";
  }
  return features;
}

/**
 * Parse the raw HTML of a 999.md listing page.
 * Returns the extracted external id, price, location parts and feature map,
 * or null when the page does not look like a parseable listing.
 */
export function parse999Listing(html) {
  if (!html || typeof html !== "string") return null;

  const ld = extractJsonLd(html);
  const name = ld?.name || null;
  const title = extractTitle(html);
  const displayLocation = ld?.displayLocation || null;
  const locationParts = name
    ? name.split(",").map((part) => part.trim()).filter(Boolean).slice(1)
    : [];

  const priceAmountRaw = getMetaContent(html, "product:price:amount");
  const priceCurrency = getMetaContent(html, "product:price:currency");
  const externalId = getMetaContent(html, "product:retailer_item_id");
  const priceAmount = priceAmountRaw != null ? Number(priceAmountRaw) : null;

  const features = extractFeatures(html);
  if (!OFFER_TYPE_LABELS.some((label) => features[label])) {
    const offerType = extractInlineOfferType(html);
    if (offerType) features[OFFER_TYPE_LABELS[0]] = offerType;
  }

  if (!externalId && Object.keys(features).length === 0) return null;

  return {
    external_id: externalId || null,
    price_amount: Number.isFinite(priceAmount) ? priceAmount : null,
    price_currency: priceCurrency || null,
    title,
    name,
    display_location: displayLocation,
    location_parts: locationParts,
    features,
  };
}

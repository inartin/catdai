import { getCachedListing, setCachedListing } from "@/lib/listing-cache";
import {
  build999ListingUrl,
  getParsedListingAddress,
  hasExactListingAddress,
  parse999Listing,
} from "@/lib/parse-999-listing";

const TABLE_BY_TYPE = {
  sale: "listing",
  rent: "listing_rent",
};

const MAX_CANDIDATES = 1000;
const PRICE_SIMILARITY_PCT = 3;
const ADDRESS_FETCH_TIMEOUT_MS = 7_000;
const ADDRESS_FETCH_CONCURRENCY = 4;
const HOUSE_NUMBER_PATTERN = String.raw`\d+(?:\s*[a-z])?(?:\s*\/\s*(?:\d+(?:\s*[a-z])?|[a-z]))?`;
const HOUSE_NUMBER_REGEX = new RegExp(String.raw`\b(${HOUSE_NUMBER_PATTERN})\b`, "iu");

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,ru;q=0.8,en;q=0.7",
  Referer: "https://999.md/",
  "Upgrade-Insecure-Requests": "1",
};

const REQUIRED_MATCH_FIELDS = [
  "city",
  "district",
  "rooms_count",
  "area_m2",
  "floor",
  "total_floors",
  "building_type",
];

const DETAIL_MATCH_FIELDS = [
  "renovation",
  "bathrooms_count",
  "balconies_count",
];

const LISTING_SELECT_FIELDS = `
  id,
  source,
  external_id,
  source_url,
  is_active,
  first_seen_at,
  last_seen_at,
  title,
  price_amount,
  price_currency,
  price_per_m2,
  images_count,
  property_type,
  deal_type,
  area_m2,
  rooms_count,
  floor,
  total_floors,
  building_type,
  renovation,
  bathrooms_count,
  balconies_count,
  city,
  district,
  sector,
  address_text,
  owner_id,
  attributes,
  owner:owner_id(
    id,
    external_owner_id,
    display_name,
    login,
    business_plan,
    business_id,
    is_verified
  )
`;

function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function cleanNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCurrency(value) {
  return cleanText(value)?.toUpperCase() || null;
}

function normalizeAddressText(value) {
  if (Array.isArray(value)) return cleanText(value.join(", "));
  return cleanText(value);
}

function normalizeAddressString(value) {
  return String(value || "")
    .replace(/[șşṣ]/gi, "s")
    .replace(/[țţṭ]/gi, "t")
    .replace(/[âîã]/gi, "a")
    .replace(/[ă]/gi, "a")
    .toLowerCase()
    .replace(/\bmun\.?\b/g, "municipiul")
    .replace(/\bstrada\b|\bstr\.?\b/g, "str")
    .replace(/\bbulevardul\b|\bbulevard\b|\bbd\.?\b/g, "bd")
    .replace(/\s*,\s*/g, ",")
    .replace(/[.;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStreetName(value) {
  return normalizeAddressString(value)
    .replace(/\b(str|bd|blvd|aleea|sos|soseaua)\b/g, " ")
    .replace(new RegExp(String.raw`\b${HOUSE_NUMBER_PATTERN}\b`, "giu"), " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHouseNumber(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function extractHouseNumber(value) {
  const match = normalizeAddressString(value).match(HOUSE_NUMBER_REGEX);
  return match ? normalizeHouseNumber(match[1]) : null;
}

function parseAddress(value) {
  const raw = normalizeAddressText(value);
  if (!raw) return null;

  const normalized = normalizeAddressString(raw);
  const segments = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  const streetIndex = segments.findIndex((part) => /\b(str|bd|blvd|aleea|sos|soseaua)\b/.test(part));
  const streetSegment = streetIndex >= 0
    ? segments[streetIndex]
    : (segments.length >= 2 ? segments[segments.length - 2] : segments[segments.length - 1]);
  const houseSegment = streetIndex >= 0
    ? (segments[streetIndex + 1] || streetSegment)
    : (segments.length >= 2 ? segments[segments.length - 1] : streetSegment);

  return {
    raw,
    normalized,
    street: streetSegment ? normalizeStreetName(streetSegment) : null,
    house_number: extractHouseNumber(houseSegment) || extractHouseNumber(streetSegment),
  };
}

function compareAddresses(targetAddress, candidateAddress) {
  const target = parseAddress(targetAddress);
  const candidate = parseAddress(candidateAddress);

  if (!target || !candidate) {
    return { status: "missing", target: target?.raw || null, candidate: candidate?.raw || null };
  }

  if (target.normalized === candidate.normalized) {
    if (!hasExactListingAddress(target.raw) || !hasExactListingAddress(candidate.raw)) {
      return { status: "unknown", target: target.raw, candidate: candidate.raw };
    }
    return { status: "match", target: target.raw, candidate: candidate.raw };
  }

  const hasExactParts = target.street && candidate.street && target.house_number && candidate.house_number;
  if (hasExactParts) {
    const sameStreet = target.street === candidate.street;
    const sameHouse = target.house_number === candidate.house_number;
    if (sameStreet && sameHouse) {
      return { status: "match", target: target.raw, candidate: candidate.raw };
    }
    return {
      status: "conflict",
      target: target.raw,
      candidate: candidate.raw,
      target_street: target.street,
      candidate_street: candidate.street,
      target_house_number: target.house_number,
      candidate_house_number: candidate.house_number,
    };
  }

  return { status: "unknown", target: target.raw, candidate: candidate.raw };
}

export function normalizeListingDuplicateType(value) {
  const normalized = String(value || "").toLowerCase().trim();
  if (!normalized) return null;
  if (["sale", "sell", "listing", "vanzare", "vânzare", "vand", "vând"].includes(normalized)) {
    return "sale";
  }
  if (["rent", "rental", "listing_rent", "chirie", "inchiriere", "închiriere"].includes(normalized)) {
    return "rent";
  }
  if (normalized.includes("chiri") || normalized.includes("închiri") || normalized.includes("inchiri")) {
    return "rent";
  }
  if (normalized.includes("vând") || normalized.includes("vand")) return "sale";
  return null;
}

function normalizeExternalId(value) {
  const externalId = cleanText(value);
  return externalId && /^\d{5,}$/.test(externalId) ? externalId : null;
}

function rawListingFromBody(body) {
  const params = body?.params && typeof body.params === "object" ? body.params : {};
  const listing = body?.listing && typeof body.listing === "object" ? body.listing : {};
  return {
    ...params,
    ...body,
    ...listing,
  };
}

function normalizeListingInput(raw) {
  const source = raw || {};
  return {
    id: cleanText(source.id),
    source: cleanText(source.source),
    external_id: normalizeExternalId(source.external_id || source.listing_id),
    source_url: cleanText(source.source_url || source.listing_url),
    title: cleanText(source.title),
    price_amount: cleanNumber(source.price_amount ?? source.listing_price),
    price_currency: normalizeCurrency(source.price_currency ?? source.listing_currency),
    price_per_m2: cleanNumber(source.price_per_m2),
    area_m2: cleanNumber(source.area_m2 ?? source.area),
    rooms_count: cleanInteger(source.rooms_count ?? source.rooms),
    floor: cleanInteger(source.floor),
    total_floors: cleanInteger(source.total_floors),
    building_type: cleanText(source.building_type),
    renovation: cleanText(source.renovation),
    bathrooms_count: cleanInteger(source.bathrooms_count ?? source.bathrooms),
    balconies_count: cleanInteger(source.balconies_count ?? source.balconies),
    city: cleanText(source.city),
    district: cleanText(source.district),
    sector: cleanText(source.sector),
    address_text: normalizeAddressText(
      source.address_text ||
      source.address ||
      source.display_location ||
      source.listing_address ||
      source.location_parts
    ),
    owner_id: cleanText(source.owner_id),
    images_count: cleanInteger(source.images_count),
    deal_type: cleanText(source.deal_type),
    attributes: source.attributes && typeof source.attributes === "object" ? source.attributes : null,
    owner: source.owner && typeof source.owner === "object" ? source.owner : null,
    first_seen_at: source.first_seen_at || null,
    last_seen_at: source.last_seen_at || null,
  };
}

function mergePresent(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value !== null && value !== undefined && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function valuesMatch(a, b) {
  if (!hasValue(a) || !hasValue(b)) return false;
  return String(a) === String(b);
}

function getMissingRequiredFields(listing) {
  return REQUIRED_MATCH_FIELDS.filter((field) => !hasValue(listing[field]));
}

async function fetchSourceListing(supabase, listingType, externalId) {
  const table = TABLE_BY_TYPE[listingType];
  if (!table || !externalId) return null;

  const { data, error } = await supabase
    .from(table)
    .select(LISTING_SELECT_FIELDS)
    .eq("external_id", externalId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function resolveSourceListing(supabase, explicitType, externalId) {
  if (!externalId) return { listingType: explicitType || "sale", sourceListing: null };

  if (explicitType) {
    return {
      listingType: explicitType,
      sourceListing: await fetchSourceListing(supabase, explicitType, externalId),
    };
  }

  const saleListing = await fetchSourceListing(supabase, "sale", externalId);
  if (saleListing) return { listingType: "sale", sourceListing: saleListing };

  const rentListing = await fetchSourceListing(supabase, "rent", externalId);
  if (rentListing) return { listingType: "rent", sourceListing: rentListing };

  return { listingType: "sale", sourceListing: null };
}

function buildCandidateQuery(supabase, listingType, target) {
  let query = supabase
    .from(TABLE_BY_TYPE[listingType])
    .select(LISTING_SELECT_FIELDS)
    .eq("is_active", true);

  for (const field of REQUIRED_MATCH_FIELDS) {
    query = query.eq(field, target[field]);
  }

  if (target.id) {
    query = query.neq("id", target.id);
  } else if (target.external_id) {
    query = query.neq("external_id", target.external_id);
  }

  return query
    .order("last_seen_at", { ascending: false })
    .limit(MAX_CANDIDATES);
}

async function fetchListingHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ADDRESS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function addressFromParsedListing(parsed) {
  return normalizeAddressText(getParsedListingAddress(parsed));
}

async function getListingAddress(externalId) {
  if (!externalId) return null;

  try {
    const cached = await getCachedListing(externalId);
    const cachedAddress = addressFromParsedListing(cached);
    if (hasExactListingAddress(cachedAddress)) return cachedAddress;
  } catch {
    // Cache is optional.
  }

  const listingUrl = build999ListingUrl(externalId, "ro");
  const html = await fetchListingHtml(listingUrl);
  if (!html) return null;

  const parsed = parse999Listing(html);
  if (!parsed) return null;

  try {
    await setCachedListing(externalId, parsed);
  } catch {
    // Cache is optional.
  }

  return addressFromParsedListing(parsed);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function enrichCandidateAddresses(target, candidates) {
  if (!target.address_text || candidates.length === 0) return candidates;

  return mapWithConcurrency(candidates, ADDRESS_FETCH_CONCURRENCY, async (candidate) => {
    if (candidate.address_text || !candidate.external_id) return candidate;
    const address = await getListingAddress(candidate.external_id);
    return address ? { ...candidate, address_text: address } : candidate;
  });
}

function comparePrices(target, candidate) {
  const targetPrice = cleanNumber(target.price_amount);
  const candidatePrice = cleanNumber(candidate.price_amount);
  const targetCurrency = normalizeCurrency(target.price_currency);
  const candidateCurrency = normalizeCurrency(candidate.price_currency);

  if (!targetPrice || !candidatePrice || !targetCurrency || !candidateCurrency) {
    return {
      comparable: false,
      same_currency: targetCurrency === candidateCurrency && Boolean(targetCurrency),
      similar: false,
      difference_amount: null,
      difference_pct: null,
    };
  }

  if (targetCurrency !== candidateCurrency) {
    return {
      comparable: false,
      same_currency: false,
      similar: false,
      difference_amount: null,
      difference_pct: null,
    };
  }

  const differenceAmount = candidatePrice - targetPrice;
  const differencePct = Math.abs(differenceAmount / targetPrice) * 100;

  return {
    comparable: true,
    same_currency: true,
    similar: differencePct <= PRICE_SIMILARITY_PCT,
    difference_amount: Number(differenceAmount.toFixed(2)),
    difference_pct: Number(differencePct.toFixed(2)),
  };
}

function buildDetailSignals(target, candidate) {
  const matched = [];
  const missing = [];
  const conflicts = [];

  for (const field of DETAIL_MATCH_FIELDS) {
    if (!hasValue(target[field])) continue;
    if (!hasValue(candidate[field])) {
      missing.push(field);
      continue;
    }
    if (valuesMatch(target[field], candidate[field])) {
      matched.push(field);
    } else {
      conflicts.push(field);
    }
  }

  return { matched, missing, conflicts };
}

function scoreCandidate(target, candidate) {
  const detail = buildDetailSignals(target, candidate);
  const price = comparePrices(target, candidate);
  const address = compareAddresses(target.address_text, candidate.address_text);
  const sameOwner = Boolean(target.owner_id && candidate.owner_id && target.owner_id === candidate.owner_id);

  if (address.status === "conflict") {
    return {
      probability: null,
      score: 0,
      reasons: ["same_core_fields", "conflicting_address"],
      detail,
      price,
      address,
      sameOwner,
    };
  }

  let score = 65;
  if (sameOwner) score += 25;
  if (price.similar) score += 15;
  if (address.status === "match") score += 30;
  score += detail.matched.length * 5;
  score -= detail.conflicts.length * 15;
  score = Math.max(0, Math.min(100, score));

  const reasons = ["same_core_fields"];
  if (address.status === "match") reasons.push("same_address");
  if (address.status === "missing") reasons.push("missing_address");
  if (address.status === "unknown") reasons.push("unparsed_address");
  if (sameOwner) reasons.push("same_owner");
  if (price.similar) reasons.push("similar_price");
  if (
    !price.comparable &&
    normalizeCurrency(target.price_currency) &&
    normalizeCurrency(candidate.price_currency) &&
    normalizeCurrency(target.price_currency) !== normalizeCurrency(candidate.price_currency)
  ) {
    reasons.push("different_currency");
  }
  if (detail.matched.length > 0) reasons.push("matching_detail_fields");
  if (detail.missing.length > 0) reasons.push("missing_candidate_detail_fields");
  if (detail.conflicts.length > 0) reasons.push("conflicting_detail_fields");

  if (score >= 85) return { probability: "high", score, reasons, detail, price, address, sameOwner };
  if (score >= 60) return { probability: "medium", score, reasons, detail, price, address, sameOwner };
  return { probability: null, score, reasons, detail, price, address, sameOwner };
}

function normalizeCandidate(candidate, match) {
  return {
    id: candidate.id,
    external_id: candidate.external_id,
    source_url: candidate.source_url,
    title: candidate.title,
    price_amount: candidate.price_amount,
    price_currency: candidate.price_currency,
    price_per_m2: candidate.price_per_m2,
    area_m2: candidate.area_m2,
    rooms_count: candidate.rooms_count,
    floor: candidate.floor,
    total_floors: candidate.total_floors,
    address_text: candidate.address_text,
    building_type: candidate.building_type,
    renovation: candidate.renovation,
    bathrooms_count: candidate.bathrooms_count,
    balconies_count: candidate.balconies_count,
    city: candidate.city,
    district: candidate.district,
    sector: candidate.sector,
    owner_id: candidate.owner_id,
    owner: candidate.owner || null,
    images_count: candidate.images_count,
    first_seen_at: candidate.first_seen_at,
    last_seen_at: candidate.last_seen_at,
    match: {
      probability: match.probability,
      score: match.score,
      reasons: match.reasons,
      signals: {
        same_owner: match.sameOwner,
        price: match.price,
        address: match.address,
        matched_detail_fields: match.detail.matched,
        missing_candidate_detail_fields: match.detail.missing,
        conflicting_detail_fields: match.detail.conflicts,
      },
    },
  };
}

export async function findListingDuplicates(supabase, body) {
  const raw = rawListingFromBody(body);
  const externalId = normalizeExternalId(raw.external_id || raw.listing_id);
  const explicitType = normalizeListingDuplicateType(raw.listing_type || raw.type || raw.deal_type);
  const inputListing = normalizeListingInput({ ...raw, external_id: externalId || raw.external_id });
  const { listingType, sourceListing } = await resolveSourceListing(supabase, explicitType, externalId);
  const target = normalizeListingInput(mergePresent(inputListing, sourceListing));
  if (!target.address_text && target.external_id) {
    target.address_text = await getListingAddress(target.external_id);
  }
  const missingFields = getMissingRequiredFields(target);

  if (missingFields.length > 0) {
    return {
      error: sourceListing || !externalId ? "insufficient_data" : "listing_not_found",
      listing_type: listingType,
      source_listing_found: Boolean(sourceListing),
      missing_fields: missingFields,
      high: [],
      medium: [],
    };
  }

  const { data, error } = await buildCandidateQuery(supabase, listingType, target);
  if (error) throw error;

  const high = [];
  const medium = [];
  const candidates = await enrichCandidateAddresses(target, Array.isArray(data) ? data : []);

  for (const candidate of candidates) {
    const match = scoreCandidate(target, candidate);
    if (match.probability === "high") {
      high.push(normalizeCandidate(candidate, match));
    } else if (match.probability === "medium") {
      medium.push(normalizeCandidate(candidate, match));
    }
  }

  return {
    listing_type: listingType,
    source_listing_found: Boolean(sourceListing),
    target: {
      id: target.id,
      external_id: target.external_id,
      source_url: target.source_url,
      title: target.title,
      address_text: target.address_text,
      price_amount: target.price_amount,
      price_currency: target.price_currency,
      area_m2: target.area_m2,
      rooms_count: target.rooms_count,
      floor: target.floor,
      total_floors: target.total_floors,
      building_type: target.building_type,
      renovation: target.renovation,
      bathrooms_count: target.bathrooms_count,
      balconies_count: target.balconies_count,
      city: target.city,
      district: target.district,
      owner_id: target.owner_id,
    },
    criteria: {
      required_match_fields: REQUIRED_MATCH_FIELDS,
      detail_match_fields: DETAIL_MATCH_FIELDS,
      price_similarity_pct: PRICE_SIMILARITY_PCT,
      address_check: "exact street and full building number when available",
      max_candidates: MAX_CANDIDATES,
    },
    counts: {
      candidates_checked: candidates.length,
      high: high.length,
      medium: medium.length,
      truncated: candidates.length >= MAX_CANDIDATES,
    },
    high,
    medium,
  };
}

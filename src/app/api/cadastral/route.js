import crypto from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalCadastralData } from "@/lib/cadastru-external-api";
import { fetchCadastruDetailData } from "@/lib/cadastru-address-search";
import { buildCadastruPreviewPayload } from "@/lib/cadastru-preview";
import { logCadastruSearchEvent } from "@/lib/cadastru-search-events";
import { getCadastruRecordByNumber, persistCadastruRecord } from "@/lib/cadastru-records";
import { resolveAccessTier } from "@/lib/access-tier";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import {
  checkFeatureAccess,
  consumeFeatureCredit,
  makePaidFeatureUsageKey,
} from "@/lib/paid-feature-usage";
import { matchDistrict, CADASTRAL_RE } from "@/lib/validation";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 15 });
const CADASTRU_LOOKUP_FEATURE_KEY = "cadastru_lookup";
const GEODATA_TIMEOUT_MS = 10_000;
const NOMINATIM_TIMEOUT_MS = 5_000;
const CADASTRAL_CACHE_PREFIX = "catdai:cadastral:v1:";
const CADASTRAL_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const CADASTRU_MD_DETAIL_APARTMENT_FIELDS = [
  "object_type",
  "destination",
  "room_usage",
  "ownership_type",
  "transactions_count",
  "real_rights",
  "notes",
  "restrictions",
];
const CADASTRU_MD_FILL_IF_MISSING_APARTMENT_FIELDS = [
  "address",
  "area_m2",
  "type",
  "estimated_value_lei",
];

async function fetchWithTimeout(url, { label, timeoutMs = GEODATA_TIMEOUT_MS, headers } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      ...(headers ? { headers } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res;
  } catch (err) {
    err.stage = label || "unknown";
    err.elapsedMs = Date.now() - started;
    throw err;
  }
}

async function fetchJsonWithTimeout(url, { label, timeoutMs = GEODATA_TIMEOUT_MS, headers } = {}) {
  const started = Date.now();
  const res = await fetchWithTimeout(url, { label, timeoutMs, headers });
  if (!res.ok) {
    const err = new Error(`Upstream ${label || "request"} returned ${res.status}`);
    err.stage = label || "unknown";
    err.status = res.status;
    err.elapsedMs = Date.now() - started;
    throw err;
  }
  return res.json();
}

function logCadastralFetchError(err) {
  const cause = err?.cause;
  console.error("[cadastral] Fetch error:", {
    stage: err?.stage || "unknown",
    status: err?.status || null,
    code: err?.code || cause?.code || err?.name || null,
    message: err?.message || String(err),
    elapsed_ms: err?.elapsedMs || null,
  });
}

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function parseCadastralParts(cadastralNumber) {
  const parts = cadastralNumber.split(".");
  if (parts.length === 3) {
    const code = parts[0];
    const buildingId = code + "." + parts[1];
    const apartmentId = code + "." + parts[1] + "." + parts[2];
    return { code, buildingId, apartmentId };
  }
  const code = parts[0] + "0" + parts[1];
  const buildingId = code + "." + parts[2];
  const apartmentId = code + "." + parts[2] + "." + parts[3];
  return { code, buildingId, apartmentId };
}

function computeCentroid(coordinates) {
  const ring = coordinates[0];
  const lons = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return {
    lon: lons.reduce((a, b) => a + b) / lons.length,
    lat: lats.reduce((a, b) => a + b) / lats.length,
  };
}

function toEpsg3857(lon, lat) {
  const x = (lon * 20037508.34) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.34 / 180);
  return { x, y };
}

function extractLiValue(html, label) {
  const re = new RegExp(label + ".*?<strong>(.*?)</strong>", "is");
  const m = html.match(re);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim();
}

function parseHtmlResponse(html, buildingId, apartmentId) {
  const building = {};
  const apartment = {};

  const buildingStart = html.indexOf(`<strong>${buildingId}</strong>`);
  if (buildingStart !== -1) {
    const buildingEnd = html.indexOf("</details>", buildingStart);
    const section = html.substring(buildingStart, buildingEnd > -1 ? buildingEnd : buildingStart + 3000);

    building.address = extractLiValue(section, "Adresa/locul amplasării:");
    building.classifier = extractLiValue(section, "Clasificator:");
    building.construction_year = extractLiValue(section, "Anul construcţiei:");
    building.total_floors = extractLiValue(section, "Numărul de etaje:");
    building.condition = extractLiValue(section, "Starea blocului locativ:");
    building.gas = extractLiValue(section, "Gaz:");
    building.wall_material = extractLiValue(section, "Materialul pereţilor:");
    building.water = extractLiValue(section, "Apă:");
    building.sewage = extractLiValue(section, "Canalizare:");
    building.electricity = extractLiValue(section, "Complet electrificată:");
  }

  const aptStart = html.indexOf(`<strong>${apartmentId}</strong>`);
  if (aptStart !== -1) {
    const aptEnd = html.indexOf("</details>", aptStart);
    const section = html.substring(aptStart, aptEnd > -1 ? aptEnd : aptStart + 2000);

    apartment.address = extractLiValue(section, "Adresa:");
    apartment.area_m2 = extractLiValue(section, "Suprafața conform");
    apartment.type = extractLiValue(section, "Tipul încăperii:");
    apartment.floor = extractLiValue(section, "Etajul amplasării:");
    apartment.toilet = extractLiValue(section, "Veceu:");
    apartment.bathroom = extractLiValue(section, "Baie:");
    apartment.is_last_floor = extractLiValue(section, "Ultimul etaj:");
    apartment.estimated_value_lei = extractLiValue(section, "Valoarea estimată, lei:");
  }

  return { building, apartment };
}

function resolveDistrict(address) {
  if (!address) return null;
  const m = address.match(/sect\.\s*([^,\s][^,]*?)(?:\s+(?:str|bd|sos|al)\b|,|$)/i);
  if (!m) return null;
  return matchDistrict(m[1].trim());
}

function resolveCity(address) {
  if (!address) return null;
  if (/mun\.\s*Chișinău/i.test(address)) return "Chișinău";
  if (/mun\.\s*Bălți/i.test(address) || /mun\.\s*Balti/i.test(address)) return "Bălți";
  return null;
}

function resolveDistrictFromSuburb(suburb) {
  if (!suburb) return null;
  const cleaned = suburb
    .replace(/\s*Sector\s*$/i, "")
    .replace(/^sectorul\s*/i, "")
    .replace(/^sect\.\s*/i, "")
    .trim();
  return matchDistrict(cleaned);
}

function resolveCityFromNominatim(addr) {
  const city = addr.city || addr.town || addr.village;
  if (!city) return null;
  if (/Chi[sș]in[aă]u/i.test(city)) return "Chișinău";
  if (/B[aă]l[tț]i/i.test(city)) return "Bălți";
  return null;
}

async function fallbackNominatim(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&bounded=0&polygon_geojson=1&priority=5`;
  const res = await fetchWithTimeout(url, {
    label: "nominatim_reverse",
    timeoutMs: NOMINATIM_TIMEOUT_MS,
    headers: { "User-Agent": "CatDai/1.0" },
  });
  if (!res.ok) return null;
  return res.json();
}

function buildFormFields(building, apartment) {
  const fields = {};

  const addr = building.address || apartment.address;
  const city = resolveCity(addr);
  if (city) fields.city = city;

  const district = resolveDistrict(addr);
  if (district) fields.district = district;

  if (apartment.area_m2) {
    const area = parseFloat(apartment.area_m2);
    if (!isNaN(area) && area > 0) fields.area_m2 = String(area);
  }

  if (apartment.floor) {
    const floor = parseInt(apartment.floor, 10);
    if (!isNaN(floor)) fields.floor = String(floor);
  }

  if (building.total_floors) {
    const tf = parseInt(building.total_floors, 10);
    if (!isNaN(tf)) fields.total_floors = String(tf);
  }

  if (building.construction_year) {
    const year = parseInt(building.construction_year, 10);
    if (!isNaN(year)) {
      fields.building_type = year >= 2010 ? "Construcţii noi" : "Secundar";
    }
  }

  if (apartment.bathroom === "Da") {
    fields.bathrooms_count = 1;
  }

  return fields;
}

function hasApartmentDetails(apartment) {
  return Boolean(
    apartment?.address ||
      apartment?.area_m2 ||
      apartment?.object_type ||
      apartment?.type ||
      apartment?.destination ||
      apartment?.room_usage ||
      apartment?.estimated_value_lei ||
      apartment?.ownership_type ||
      apartment?.transactions_count ||
      apartment?.real_rights ||
      apartment?.notes ||
      apartment?.restrictions
  );
}

function hasApartmentData(apartment) {
  return Boolean(
    apartment?.area_m2 ||
      apartment?.floor ||
      apartment?.toilet ||
      apartment?.bathroom ||
      apartment?.is_last_floor ||
      apartment?.estimated_value_lei ||
      apartment?.object_type ||
      apartment?.type ||
      apartment?.destination ||
      apartment?.room_usage ||
      apartment?.ownership_type ||
      apartment?.transactions_count ||
      apartment?.real_rights ||
      apartment?.notes ||
      apartment?.restrictions
  );
}

function hasBuildingData(building) {
  return Boolean(
    building?.classifier ||
      building?.total_floors ||
      building?.condition ||
      building?.construction_year ||
      building?.wall_material ||
      building?.water ||
      building?.sewage ||
      building?.gas ||
      building?.electricity
  );
}

function hasAnyAddress(payload) {
  return Boolean(
    payload?.apartment?.address ||
      payload?.building?.address ||
      payload?.location?.display_name ||
      payload?.matched_address
  );
}

function classifyCadastralResult(payload) {
  const apartmentData = hasApartmentData(payload?.apartment);
  const buildingData = hasBuildingData(payload?.building);

  if (apartmentData && buildingData) return "full_data";
  if (apartmentData) return "apartment_only";
  if (hasAnyAddress(payload) || buildingData) return "address_only";
  return "no_data";
}

function resolveDistrictFromPayload(payload) {
  if (payload?.form_fields?.district) return payload.form_fields.district;
  const address = payload?.apartment?.address || payload?.building?.address || payload?.matched_address;
  const district = resolveDistrict(address);
  if (district) return district;
  return resolveDistrictFromSuburb(payload?.location?.suburb);
}

function resolveCityFromPayload(payload) {
  if (payload?.form_fields?.city) return payload.form_fields.city;
  const address = payload?.apartment?.address || payload?.building?.address || payload?.matched_address;
  const city = resolveCity(address);
  if (city) return city;
  return resolveCityFromNominatim(payload?.location || {});
}

function resolveSearchContext(body) {
  if (body?.search_context !== "cadastru") return null;
  return body.search_type === "address" ? "address" : "number";
}

function normalizeCadastralPayload(payload, cadastralNumber, accessTier) {
  return {
    ...payload,
    cadastral_number: payload?.cadastral_number || cadastralNumber,
    building: payload?.building || {},
    apartment: payload?.apartment || {},
    form_fields: payload?.form_fields || {},
    access_tier: accessTier,
    locked_sections: {},
  };
}

function makeCadastralCacheKey(cadastralNumber) {
  const hash = crypto
    .createHash("sha256")
    .update(cadastralNumber.trim())
    .digest("hex")
    .slice(0, 32);

  return `${CADASTRAL_CACHE_PREFIX}${hash}`;
}

function makeCadastruLookupUsageKey(cadastralNumber) {
  return makePaidFeatureUsageKey(CADASTRU_LOOKUP_FEATURE_KEY, {
    cadastral_number: String(cadastralNumber || "").trim(),
  });
}

function normalizeLookupSource(value) {
  return value === "api" || value === "local" ? value : null;
}

function makeCacheableCadastralPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const cacheable = { ...payload };
  delete cacheable.access_tier;
  delete cacheable.locked_sections;
  return cacheable;
}

function applyCadastralAccess(payload, cadastralNumber, accessTier) {
  return normalizeCadastralPayload(payload, cadastralNumber, accessTier);
}

async function getCachedCadastralPayload(cadastralNumber) {
  const cached = await getSharedCache(makeCadastralCacheKey(cadastralNumber));
  const value = cached?.value;
  if (!value?.payload) return null;

  return {
    payload: value.payload,
    lookupSource: normalizeLookupSource(value.lookup_source),
  };
}

async function setCachedCadastralPayload(cadastralNumber, payload, lookupSource) {
  await setSharedCache(
    makeCadastralCacheKey(cadastralNumber),
    {
      payload: makeCacheableCadastralPayload(payload),
      lookup_source: normalizeLookupSource(lookupSource),
    },
    CADASTRAL_CACHE_TTL_SECONDS
  );
}

async function buildCadastruDetailPayload(cadastralNumber, accessTier = "paid") {
  try {
    const detail = await fetchCadastruDetailData(cadastralNumber);
    if (!detail || !hasApartmentDetails(detail.apartment)) return null;

    return {
      ...detail,
      cadastral_number: cadastralNumber,
      form_fields: buildFormFields(detail.building || {}, detail.apartment || {}),
      partial: true,
      access_tier: accessTier,
      locked_sections: {},
    };
  } catch (error) {
    console.error("[cadastral] cadastru.md detail fetch failed:", {
      message: error?.message || String(error),
      cadastral_number: cadastralNumber,
    });
    return null;
  }
}

function hasCadastruMdDetailFields(apartment = {}) {
  return CADASTRU_MD_DETAIL_APARTMENT_FIELDS.some((field) => apartment?.[field]);
}

function hasAllCadastruMdDetailFields(apartment = {}) {
  return CADASTRU_MD_DETAIL_APARTMENT_FIELDS.every((field) => apartment?.[field]);
}

function mergeCadastruMdApartmentDetails(apartment = {}, detailApartment = {}) {
  const merged = { ...apartment };

  for (const field of CADASTRU_MD_FILL_IF_MISSING_APARTMENT_FIELDS) {
    if (!merged[field] && detailApartment?.[field]) {
      merged[field] = detailApartment[field];
    }
  }

  for (const field of CADASTRU_MD_DETAIL_APARTMENT_FIELDS) {
    if (detailApartment?.[field]) {
      merged[field] = detailApartment[field];
    }
  }

  return merged;
}

function mergeCadastruMdDetailPayload(payload, detailPayload) {
  if (!detailPayload?.apartment || !hasCadastruMdDetailFields(detailPayload.apartment)) {
    return payload;
  }

  return {
    ...payload,
    official_cadastral_number: payload?.official_cadastral_number || detailPayload.official_cadastral_number,
    raw_cadastral_number: payload?.raw_cadastral_number || detailPayload.raw_cadastral_number,
    apartment: mergeCadastruMdApartmentDetails(payload?.apartment || {}, detailPayload.apartment),
  };
}

async function enrichWithCadastruMdDetails(payload, cadastralNumber, accessTier) {
  if (hasAllCadastruMdDetailFields(payload?.apartment)) return payload;
  const detailPayload = await buildCadastruDetailPayload(cadastralNumber, accessTier);
  return detailPayload ? mergeCadastruMdDetailPayload(payload, detailPayload) : payload;
}

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed, remaining, retryAfter } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = await resolveAccessTier(request);
  const cadastruSearchType = resolveSearchContext(body);
  if (!access.user_id && !cadastruSearchType) {
    return NextResponse.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
  }

  const { cadastral_number } = body;
  if (!cadastral_number || typeof cadastral_number !== "string") {
    return NextResponse.json(
      { error: "cadastral_number is required" },
      { status: 400 }
    );
  }

  const trimmed = cadastral_number.trim();
  if (!CADASTRAL_RE.test(trimmed)) {
    return NextResponse.json(
      { error: "invalid_format", message: "Invalid cadastral number format" },
      { status: 400 }
    );
  }

  const maskPreviewCadastralNumber = cadastruSearchType === "address" || body?.preview_origin === "address";
  const creditIdempotencyKey = makeCadastruLookupUsageKey(trimmed);
  const creditCheck = await checkFeatureAccess({
    userId: access.user_id,
    featureKey: CADASTRU_LOOKUP_FEATURE_KEY,
    idempotencyKey: creditIdempotencyKey,
  });

  let lookupSource = null;
  const recordCadastruSearch = async (payload, resultType = null) => {
    if (!cadastruSearchType) return;
    await logCadastruSearchEvent(request, cadastruSearchType, {
      cadastralNumber: payload?.cadastral_number || trimmed,
      city: resolveCityFromPayload(payload),
      district: cadastruSearchType === "address" ? resolveDistrictFromPayload(payload) : null,
      resultType: resultType || classifyCadastralResult(payload),
      lookupSource,
    });
  };
  const respondWithCadastralPayload = async (payload, options = {}) => {
    if (!creditCheck.allowed) {
      const preview = buildCadastruPreviewPayload(payload, creditCheck.reason || "no_credit", {
        maskCadastralNumber: maskPreviewCadastralNumber,
      });
      const res = NextResponse.json(preview);
      res.headers.set("X-RateLimit-Remaining", String(remaining));
      return res;
    }

    const creditUsage = await consumeFeatureCredit({
      userId: access.user_id,
      featureKey: CADASTRU_LOOKUP_FEATURE_KEY,
      idempotencyKey: creditIdempotencyKey,
      metadata: {
        feature: "cadastru_lookup",
        cadastral_number: trimmed,
        search_context: cadastruSearchType,
        lookup_source: lookupSource,
      },
    });
    if (!creditUsage.allowed) {
      const preview = buildCadastruPreviewPayload(payload, creditUsage.reason || "no_credit", {
        maskCadastralNumber: maskPreviewCadastralNumber,
      });
      const res = NextResponse.json(preview);
      res.headers.set("X-RateLimit-Remaining", String(remaining));
      return res;
    }

    await setCachedCadastralPayload(trimmed, payload, lookupSource);
    await persistCadastruRecord(payload, {
      cadastralNumber: trimmed,
      lookupSource,
      resultType: options.resultType || classifyCadastralResult(payload),
      countLookup: options.countLookup !== false,
      officialFetch: options.officialFetch === true,
    });
    await recordCadastruSearch(payload);
    const res = NextResponse.json(payload);
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    return res;
  };
  const respondWithNotFound = async (message) => {
    await recordCadastruSearch({ cadastral_number: trimmed }, "no_data");
    return NextResponse.json(
      { error: "not_found", message },
      { status: 404 }
    );
  };

  const cached = await getCachedCadastralPayload(trimmed);
  if (cached) {
    lookupSource = cached.lookupSource;
    const payload = await enrichWithCadastruMdDetails(
      applyCadastralAccess(cached.payload, trimmed, access.tier),
      trimmed,
      access.tier
    );
    return respondWithCadastralPayload(
      payload,
      { countLookup: true }
    );
  }

  const stored = await getCadastruRecordByNumber(trimmed, { requireDetailPayload: true });
  if (stored) {
    lookupSource = stored.lookupSource;
    const payload = await enrichWithCadastruMdDetails(
      applyCadastralAccess(stored.payload, trimmed, access.tier),
      trimmed,
      access.tier
    );
    return respondWithCadastralPayload(
      payload,
      { countLookup: true, resultType: stored.resultType }
    );
  }

  try {
    const externalPayload = await fetchExternalCadastralData(trimmed);
    lookupSource = "api";
    const payload = await enrichWithCadastruMdDetails(
      normalizeCadastralPayload(externalPayload, trimmed, access.tier),
      trimmed,
      access.tier
    );
    return respondWithCadastralPayload(
      payload,
      { officialFetch: true }
    );
  } catch (error) {
    const details = {
      code: error?.code || error?.name || "external_cadastru_failed",
      status: error?.status || null,
      message: error?.message || String(error),
      fallback: Boolean(error?.fallbackEligible),
      cadastral_number: trimmed,
    };

    if (!error?.fallbackEligible) {
      console.error("[cadastral] external cadastru API failed:", details);
      if (error?.status === 404 || error?.code === "not_found") {
        return respondWithNotFound("Cadastral number not found");
      }

      return NextResponse.json(
        { error: "Failed to fetch cadastral data" },
        { status: error?.status === 400 ? 400 : 502 }
      );
    }

    // console.error("[cadastral] external cadastru API unavailable, using local backup:", details);
  }

  lookupSource = "local";
  const { code, buildingId, apartmentId } = parseCadastralParts(trimmed);

  try {
    const step1Url = `https://geodata.gov.md/geoserver/w_cbi/wfs?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application%2Fjson&maxFeatures=5&typeName=cad_terenuri&cql_filter=(codcadastral+LIKE+%27%25${code}%25%27)&sortBy=codcadastral&srsName=EPSG:4326`;
    const step1 = await fetchJsonWithTimeout(step1Url, { label: "geodata_wfs" });

    if (!step1.features || step1.features.length === 0) {
      const detailPayload = await buildCadastruDetailPayload(trimmed, access.tier);
      if (detailPayload) {
        return respondWithCadastralPayload(detailPayload, { officialFetch: true });
      }

      return respondWithNotFound("Cadastral number not found");
    }

    const feature = step1.features[0];
    const { lon, lat } = computeCentroid(feature.geometry.coordinates);
    const { x, y } = toEpsg3857(lon, lat);

    const offset = 30;
    const bbox = `${x - offset},${y - offset},${x + offset},${y + offset}`;

    const step3Url = `https://geodata.gov.md/geoserver/contestare/wms?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=S1&query_layers=S1&x=51&y=51&height=101&width=101&srs=EPSG:3857&bbox=${bbox}&feature_count=10&info_format=application%2Fjson&ENV=mapstore_language:en`;
    const step3 = await fetchJsonWithTimeout(step3Url, { label: "geodata_wms" });

    if (!step3.features || step3.features.length === 0) {
      const detailPayload = await buildCadastruDetailPayload(trimmed, access.tier);
      if (detailPayload) {
        return respondWithCadastralPayload(detailPayload, { officialFetch: true });
      }

      const nominatim = await fallbackNominatim(lat, lon);
      if (!nominatim?.address) {
        return respondWithNotFound("No property data found for this cadastral number");
      }

      const addr = nominatim.address;
      const form_fields = {};
      const city = resolveCityFromNominatim(addr);
      if (city) form_fields.city = city;
      const district = resolveDistrictFromSuburb(addr.suburb);
      if (district) form_fields.district = district;

      const location = {
        display_name: nominatim.display_name,
        road: addr.road || null,
        house_number: addr.house_number || null,
        suburb: addr.suburb || null,
        city: addr.city || addr.town || addr.village || null,
        postcode: addr.postcode || null,
      };


      return respondWithCadastralPayload({
        cadastral_number: trimmed,
        building: {},
        apartment: {},
        location,
        form_fields,
        partial: true,
        access_tier: access.tier,
        locked_sections: {},
      }, { officialFetch: true });
    }

    const html = step3.features[0].properties?.html || "";
    const { building, apartment } = parseHtmlResponse(html, buildingId, apartmentId);
    const detailPayload = await buildCadastruDetailPayload(trimmed, access.tier);
    if (detailPayload) {
      const mergedApartment = mergeCadastruMdApartmentDetails(apartment, detailPayload.apartment);
      const mergedBuilding = Object.keys(building).length ? building : detailPayload.building;
      const isPartial = !hasApartmentData(apartment) || !hasBuildingData(building);
      const payload = mergeCadastruMdDetailPayload(
        {
          cadastral_number: trimmed,
          building: mergedBuilding,
          apartment: mergedApartment,
          form_fields: buildFormFields(mergedBuilding, mergedApartment),
          partial: isPartial || undefined,
          access_tier: access.tier,
          locked_sections: {},
        },
        detailPayload
      );
      return respondWithCadastralPayload(payload, { officialFetch: true });
    }

    const form_fields = buildFormFields(building, apartment);

    const payload = {
      cadastral_number: trimmed,
      building,
      apartment,
      form_fields,
      access_tier: access.tier,
      locked_sections: {},
    };

    return respondWithCadastralPayload(payload, { officialFetch: true });
  } catch (err) {
    logCadastralFetchError(err);
    return NextResponse.json(
      { error: "Failed to fetch cadastral data" },
      { status: err?.name === "TimeoutError" || err?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" ? 504 : 502 }
    );
  }
}

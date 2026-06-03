const DEFAULT_ADDRESS = "chisinau, str Dumitru Riscanu 14 ap 20";
const USER_AGENT = "CatDaiAddressCadastralProbe/1.0";
const CADASTRU_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const WMS_URL = "https://geodata.gov.md/geoserver/contestare/wms";
const WFS_URL = "https://geodata.gov.md/geoserver/w_cbi/wfs";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CADASTRU_PAGE_URL = "https://www.cadastru.md/ecadastru/f?p=100:1";
const CADASTRU_SESSION_URLS = [
  CADASTRU_PAGE_URL,
  "https://www.cadastru.md/ecadastru/f?p=100:1::::::",
  "https://www.cadastru.md/ecadastru/",
  "https://www.cadastru.md/ecadastru/f?p=100",
];
const CADASTRU_APEX_URL = "https://www.cadastru.md/ecadastru/wwv_flow.show";
const CADASTRU_LAYERS = [
  "terenuri",
  "cladiri",
  "grevari",
  "ORTO_2016_2020_2021",
  "state",
  "raion",
  "comune",
  "localit",
  "sector",
  "strazi",
  "pct_address",
].join(",");

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/gi, (m) => (m === m.toUpperCase() ? "S" : "s"))
    .replace(/[țţ]/gi, (m) => (m === m.toUpperCase() ? "T" : "t"));
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value) {
  return normalizeSpaces(stripDiacritics(value).toLowerCase())
    .replace(/[.,;:()]/g, " ")
    .replace(/\bmunicipiul\b/g, "mun")
    .replace(/\bsectorul\b/g, "sect")
    .replace(/\bbulevardul\b|\bbulevard\b|\bbd\b|\bbul\b|\bb-dul\b/g, "bd")
    .replace(/\bstrada\b|\bstr\b/g, "str")
    .replace(/\bsoseaua\b|\bsos\b/g, "sos")
    .replace(/\bapartamentul\b|\bapartament\b|\bapt\b|\bap\b/g, "ap")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCity(value) {
  const normalized = normalizeForMatch(value);
  if (/(^|[\s,])(chisinau|kishinev|кишинев|кишинэу)([\s,]|$)/i.test(normalized)) {
    return "Chișinău";
  }
  if (/(^|[\s,])(balti|bălți|beltsy|бельцы)([\s,]|$)/i.test(normalized)) {
    return "Bălți";
  }
  return null;
}

function canonicalRoadType(value) {
  const normalized = normalizeForMatch(value);
  if (/\bbd\b/.test(normalized)) return "Bulevardul";
  if (/\bstr\b/.test(normalized)) return "Strada";
  if (/\bsos\b/.test(normalized)) return "Soseaua";
  if (/\balea\b/.test(normalized)) return "Aleea";
  return "";
}

function removeCityFromAddress(address, city) {
  if (!city) return address;
  const aliases = city === "Chișinău"
    ? ["chisinau", "chișinău", "mun chisinau", "mun. chisinau", "mun chișinău", "mun. chișinău"]
    : ["balti", "bălți", "mun balti", "mun. balti", "mun bălți", "mun. bălți"];
  let output = address;
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`(^|[,\\s])${escaped}(?=,|\\s|$)`, "ig"), " ");
  }
  return normalizeSpaces(output.replace(/^[\s,]+|[\s,]+$/g, ""));
}

function normalizeRoadForQuery(address) {
  return normalizeSpaces(address)
    .replace(/\bb-dul\.?\b/gi, "Bulevardul")
    .replace(/\bbd\.?\b/gi, "Bulevardul")
    .replace(/\bbul\.?\b/gi, "Bulevardul")
    .replace(/\bstr\.?\b/gi, "Strada")
    .replace(/\bsos\.?\b/gi, "Soseaua");
}

function knownStreetNameVariants(value) {
  const original = normalizeSpaces(value);
  const variants = [original];

  if (/\briscanu\b/i.test(normalizeForMatch(original))) {
    variants.push(original.replace(/\briscanu\b/gi, "Rascanu"));
    variants.push(original.replace(/\briscanu\b/gi, "Râșcanu"));
  }

  return unique(variants);
}

function normalizeApartmentKey(value) {
  const cleaned = normalizeSpaces(stripDiacritics(value))
    .replace(/^nr\.?\s*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (/^\d+$/.test(cleaned)) return String(Number(cleaned));
  return cleaned.replace(/^0+(?=\d)/, "");
}

function parseInputAddress(rawAddress) {
  const raw = normalizeSpaces(rawAddress || DEFAULT_ADDRESS);
  const apartmentMatch = raw.match(
    /(?:^|[\s,;])(?:ap(?:artament(?:ul)?)?|apt|apart\.?|кв(?:артира)?|квартира)\.?\s*(?:nr\.?\s*)?([0-9a-zA-Z/-]+)/i
  );

  if (!apartmentMatch) {
    throw new Error("Could not find apartment marker. Use forms like `ap 59`, `ap.59`, `apt 59`, or `apartament 59`.");
  }

  const apartment = apartmentMatch[1];
  const withoutApartment = normalizeSpaces(
    raw
      .slice(0, apartmentMatch.index)
      .concat(" ", raw.slice(apartmentMatch.index + apartmentMatch[0].length))
      .replace(/\s+,/g, ",")
      .replace(/,+/g, ",")
      .replace(/^,|,$/g, "")
  );
  const city = canonicalCity(raw);
  const buildingAddress = normalizeRoadForQuery(withoutApartment);
  const buildingAddressWithoutCity = normalizeRoadForQuery(removeCityFromAddress(withoutApartment, city));

  const houseMatch = buildingAddressWithoutCity.match(/\b(\d+[a-zA-Z]?(?:[/-]\d+[a-zA-Z]?)?)\b/);
  const houseNumber = houseMatch ? houseMatch[1] : null;
  const roadType = canonicalRoadType(withoutApartment);
  let streetName = null;

  if (houseNumber) {
    const beforeHouse = buildingAddressWithoutCity.slice(0, buildingAddressWithoutCity.indexOf(houseNumber));
    streetName = normalizeSpaces(
      beforeHouse
        .replace(/\b(Bulevardul|Strada|Soseaua|Aleea)\b/gi, "")
        .replace(/[,]/g, " ")
    );
  }
  const streetNameVariants = streetName ? knownStreetNameVariants(streetName) : [];

  return {
    raw,
    city,
    apartment,
    apartmentKey: normalizeApartmentKey(apartment),
    buildingAddress,
    buildingAddressWithoutCity,
    houseNumber,
    roadType,
    streetName,
    streetNameVariants,
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => normalizeSpaces(value)))];
}

function buildNominatimRequests(parsed) {
  const streetNames = parsed.streetNameVariants?.length ? parsed.streetNameVariants : [parsed.streetName].filter(Boolean);
  const streetQueries = streetNames.flatMap((streetName) => [
    parsed.houseNumber && parsed.city
      ? `${parsed.city}, ${parsed.roadType} ${streetName} ${parsed.houseNumber}, Moldova`
      : null,
    parsed.houseNumber ? `${parsed.roadType} ${streetName} ${parsed.houseNumber}, Moldova` : null,
  ]);
  const queries = unique([
    parsed.buildingAddress,
    parsed.city ? `${parsed.city}, ${parsed.buildingAddressWithoutCity}` : null,
    `${parsed.buildingAddress}, Moldova`,
    parsed.city ? `${parsed.city}, ${parsed.buildingAddressWithoutCity}, Moldova` : null,
    ...streetQueries,
  ]);

  const requests = queries.map((q) => ({ type: "q", q }));

  if (parsed.city && parsed.houseNumber && streetNames.length) {
    const street = normalizeSpaces(`${parsed.houseNumber} ${parsed.roadType} ${streetNames[0]}`);
    requests.push({ type: "structured", street, city: parsed.city, country: "Moldova" });
  }

  return requests;
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 15_000),
    headers: {
      "User-Agent": USER_AGENT,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
  }
  return { text, headers: res.headers, status: res.status, url: res.url };
}

async function fetchJson(url, options = {}) {
  const { text } = await fetchText(url, options);
  return JSON.parse(text);
}

function nominatimUrl(request) {
  const params = new URLSearchParams({
    format: "json",
    addressdetails: "1",
    limit: "8",
    countrycodes: "md",
  });

  if (request.type === "structured") {
    params.set("street", request.street);
    params.set("city", request.city);
    params.set("country", request.country);
  } else {
    params.set("q", request.q);
  }

  return `${NOMINATIM_URL}?${params.toString()}`;
}

function scoreNominatimResult(result, parsed) {
  const address = result.address || {};
  let score = 0;

  if (result.class === "building") score += 50;
  if (result.class === "place" && result.type === "house") score += 40;
  if (address.house_number && parsed.houseNumber && normalizeForMatch(address.house_number) === normalizeForMatch(parsed.houseNumber)) {
    score += 30;
  }
  if (parsed.city && normalizeForMatch(address.city || address.town || address.village || "").includes(normalizeForMatch(parsed.city))) {
    score += 20;
  }
  if (result.type === "cafe" || result.class === "shop" || result.class === "amenity") score -= 15;

  return score;
}

async function geocodeBuilding(parsed) {
  const requests = buildNominatimRequests(parsed);
  const byCoordinate = new Map();

  for (const request of requests) {
    const results = await fetchJson(nominatimUrl(request));
    for (const result of results) {
      const lat = Number(result.lat);
      const lon = Number(result.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const key = `${lat.toFixed(7)},${lon.toFixed(7)}`;
      const score = scoreNominatimResult(result, parsed);
      const previous = byCoordinate.get(key);
      if (!previous || score > previous.score) {
        byCoordinate.set(key, { ...result, lat, lon, score, geocode_request: request });
      }
    }
  }

  return [...byCoordinate.values()].sort((a, b) => b.score - a.score);
}

function toEpsg3857(lon, lat) {
  return {
    x: (lon * 20037508.34) / 180,
    y:
      (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
      (20037508.34 / 180),
  };
}

async function queryOfficialHtml(lon, lat, offset = 30) {
  const { x, y } = toEpsg3857(lon, lat);
  const bbox = `${x - offset},${y - offset},${x + offset},${y + offset}`;
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.1.1",
    request: "GetFeatureInfo",
    layers: "S1",
    query_layers: "S1",
    x: "51",
    y: "51",
    height: "101",
    width: "101",
    srs: "EPSG:3857",
    bbox,
    feature_count: "10",
    info_format: "application/json",
    ENV: "mapstore_language:en",
  });
  const json = await fetchJson(`${WMS_URL}?${params.toString()}`);
  return (json.features || [])
    .map((feature) => ({
      id: feature.id,
      html: feature.properties?.html || "",
    }))
    .filter((feature) => feature.html);
}

async function queryWfsByPoint(typeName, lon, lat, offsetDegrees = 0.0002) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    outputFormat: "application/json",
    maxFeatures: "50",
    typeName,
    srsName: "EPSG:4326",
    bbox: `${lon - offsetDegrees},${lat - offsetDegrees},${lon + offsetDegrees},${lat + offsetDegrees},EPSG:4326`,
  });
  const json = await fetchJson(`${WFS_URL}?${params.toString()}`);
  return json.features || [];
}

function pointInRing([lon, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry, lon, lat) {
  if (!geometry?.coordinates) return false;
  if (geometry.type === "Polygon") {
    return pointInRing([lon, lat], geometry.coordinates[0] || []);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInRing([lon, lat], polygon[0] || []));
  }
  return false;
}

function containingFeatures(features, lon, lat) {
  return features
    .filter((feature) => geometryContainsPoint(feature.geometry, lon, lat))
    .sort((a, b) => Number(a.properties?.suprafata || Infinity) - Number(b.properties?.suprafata || Infinity));
}

function stripHtml(value) {
  return normalizeSpaces(
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
  );
}

function extractStrongAfterLabel(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`${escaped}[\\s\\S]*?<strong>([\\s\\S]*?)</strong>`, "i"));
  return match ? stripHtml(match[1]) : null;
}

function extractStrictLiValue(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`<li>\\s*${escaped}\\s*<strong>([\\s\\S]*?)</strong>\\s*</li>`, "i"));
  return match ? stripHtml(match[1]) : null;
}

function normalizeDetailLabel(value) {
  return normalizeForMatch(value)
    .replace(/:$/g, "")
    .trim();
}

function parseDetailTableRows(html) {
  const rows = new Map();
  const rowRe = /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;
  let match;

  while ((match = rowRe.exec(html))) {
    const label = normalizeDetailLabel(stripHtml(match[1]));
    const value = stripHtml(match[2]);
    if (label && value) rows.set(label, value);
  }

  return rows;
}

function getDetailValue(rows, labels) {
  for (const label of labels) {
    const value = rows.get(normalizeDetailLabel(label));
    if (value) return value;
  }
  return null;
}

function normalizeAreaValue(value) {
  const match = String(value || "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function normalizeEstimatedValue(value) {
  return value ? String(value).replace(/\s*lei\s*$/i, "").trim() : null;
}

function parseCadastruDetailHtml(html) {
  const rows = parseDetailTableRows(html);
  if (!rows.size) return null;

  const cadastralNumber = getDetailValue(rows, ["Numărul cadastral"]);
  const address = getDetailValue(rows, ["Adresa"]);
  const area = normalizeAreaValue(getDetailValue(rows, ["Suprafața", "Suprafata"]));
  const type = getDetailValue(rows, ["Utilizarea incaperii", "Utilizarea încăperii", "Tipul încăperii", "Tipul obiectului"]);
  const estimatedValue = normalizeEstimatedValue(
    getDetailValue(rows, ["Valoarea estimată a bunului imobil, lei", "Valoarea estimată, lei"])
  );

  if (!cadastralNumber && !address && !area && !estimatedValue) return null;

  return {
    raw_cadastral_number: cadastralNumber || null,
    apartment: {
      address,
      area_m2: area,
      type,
      destination: getDetailValue(rows, ["Destinație", "Destinatie"]),
      estimated_value_lei: estimatedValue,
      last_estimated_at: getDetailValue(rows, ["Data ultimei estimări", "Data ultimei estimari"]),
      ownership_type: getDetailValue(rows, ["Tipul de proprietate"]),
      real_rights: getDetailValue(rows, ["Alte drepturi reale"]),
      notes: getDetailValue(rows, ["Notări", "Notari"]),
      restrictions: getDetailValue(rows, ["Interdicții", "Interdictii"]),
      transactions_count: getDetailValue(rows, ["Numărul tranzacțiilor", "Numarul tranzactiilor"]),
    },
    raw_response_preview: stripHtml(html).slice(0, 1000),
  };
}

function extractOfficialApartmentFromAddress(address) {
  const match = normalizeForMatch(address).match(/\bap\s*([0-9a-z/-]+)/i);
  return match ? normalizeApartmentKey(match[1]) : null;
}

function formatCadastralNumber(raw) {
  const match = String(raw || "").match(/^(\d{7})(\d{4})\.(\d{2})\.(\d{3,4})$/);
  if (!match) return raw;
  return `${match[1]}.${String(Number(match[2]))}.${match[3]}.${match[4]}`;
}

function compactParcelCode(raw) {
  const value = String(raw || "").trim();
  const dottedParcel = value.match(/^(\d{7})\.(\d{1,4})$/);
  if (dottedParcel) return `${dottedParcel[1]}${dottedParcel[2].padStart(4, "0")}`;

  const digits = value.replace(/\D/g, "");
  if (/^\d{11}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `${digits.slice(0, 7)}0${digits.slice(7)}`;
  return null;
}

function displayCadastralNumber(raw) {
  const value = String(raw || "").trim();
  if (/^\d{7}\.\d{1,4}\.\d{2}\.\d{3}$/.test(value)) return value;
  return formatCadastralNumber(value);
}

function normalizeBuildingCadastralNumber(raw) {
  const value = String(raw || "").trim();
  if (/^\d{7,12}\.\d{2}$/.test(value)) return value;
  if (/^\d{7}\.\d{1,4}\.\d{2}$/.test(value)) return value;
  return null;
}

function deriveApartmentCadastralNumber(buildingCadastralNumber, parsed) {
  const buildingNumber = normalizeBuildingCadastralNumber(buildingCadastralNumber);
  if (!buildingNumber || !/^\d+$/.test(parsed.apartmentKey)) return null;
  return `${buildingNumber}.${parsed.apartmentKey.padStart(3, "0")}`;
}

function normalizeHouseNumber(value) {
  return normalizeSpaces(stripDiacritics(value || ""))
    .replace(/\s+/g, "")
    .replace(/[.,;:]$/g, "")
    .toLowerCase();
}

function shortRoadType(roadType) {
  if (roadType === "Bulevardul") return "bd";
  if (roadType === "Strada") return "str";
  if (roadType === "Soseaua") return "sos";
  if (roadType === "Aleea") return "al";
  return roadType || "";
}

function extractHouseNumberFromAddress(address, parsed) {
  const normalizedAddress = normalizeForMatch(address);
  const streetNames = parsed.streetNameVariants?.length ? parsed.streetNameVariants : [parsed.streetName].filter(Boolean);
  const roadType = normalizeForMatch(shortRoadType(parsed.roadType));
  const patterns = unique(streetNames.flatMap((streetName) => {
    const normalizedStreetName = normalizeForMatch(streetName || "");
    return [
      roadType && normalizedStreetName ? `${roadType} ${normalizedStreetName}` : null,
      normalizedStreetName,
    ];
  }));

  for (const pattern of patterns) {
    const index = normalizedAddress.indexOf(pattern);
    if (index === -1) continue;
    const afterStreet = normalizedAddress.slice(index + pattern.length);
    const match = afterStreet.match(/\b(\d+[a-z]?(?:[/-]\d+[a-z]?)?)\b/i);
    if (match) return match[1];
  }

  return null;
}

function addressMatchesParsedBuilding(address, parsed) {
  if (!address) return false;
  const normalizedAddress = normalizeForMatch(address);
  const streetNames = parsed.streetNameVariants?.length ? parsed.streetNameVariants : [parsed.streetName].filter(Boolean);
  if (streetNames.length) {
    const hasStreetMatch = streetNames.some((streetName) => {
      const streetTokens = normalizeForMatch(streetName).split(" ").filter(Boolean);
      return streetTokens.every((token) => normalizedAddress.includes(token));
    });
    if (!hasStreetMatch) return false;
  }

  if (!parsed.houseNumber) return true;
  const officialHouse = extractHouseNumberFromAddress(address, parsed);
  return normalizeHouseNumber(officialHouse) === normalizeHouseNumber(parsed.houseNumber);
}

function geocodeMatchesParsedBuilding(result, parsed) {
  const address = result.address || {};
  if (parsed.houseNumber && normalizeHouseNumber(address.house_number) !== normalizeHouseNumber(parsed.houseNumber)) {
    return false;
  }

  const road = normalizeForMatch(address.road || result.display_name || "");
  const streetNames = parsed.streetNameVariants?.length ? parsed.streetNameVariants : [parsed.streetName].filter(Boolean);
  if (streetNames.length) {
    const hasStreetMatch = streetNames.some((streetName) => {
      const streetTokens = normalizeForMatch(streetName).split(" ").filter(Boolean);
      return streetTokens.every((token) => road.includes(token));
    });
    if (!hasStreetMatch) return false;
  }

  if (!parsed.city) return true;
  const city = normalizeForMatch(address.city || address.town || address.village || result.display_name || "");
  return city.includes(normalizeForMatch(parsed.city));
}

function buildCadastruSearchQueries(parsed) {
  const shortType = shortRoadType(parsed.roadType);
  const streetNames = parsed.streetNameVariants?.length ? parsed.streetNameVariants : [parsed.streetName].filter(Boolean);
  const compactStreets = streetNames
    .filter(() => parsed.houseNumber)
    .map((streetName) => normalizeSpaces(`${shortType} ${streetName} ${parsed.houseNumber}`));

  return unique([
    ...compactStreets,
    parsed.buildingAddressWithoutCity,
    ...compactStreets.map((compactStreet) => (parsed.city ? `${parsed.city}, ${compactStreet}` : null)),
    parsed.city ? `${parsed.city}, ${parsed.buildingAddressWithoutCity}` : null,
  ]);
}

function splitSetCookieHeader(value) {
  return String(value || "")
    .split(/,(?=\s*[^;,=\s]+=[^;,]+)/)
    .map((cookie) => cookie.split(";")[0].trim())
    .filter(Boolean);
}

function mergeCookieHeader(cookieHeader, cookies) {
  const merged = new Map();
  splitSetCookieHeader(cookieHeader).forEach((cookie) => {
    const name = cookie.split("=")[0];
    if (name) merged.set(name, cookie);
  });
  cookies.forEach((cookie) => {
    const name = cookie.split("=")[0];
    if (name) merged.set(name, cookie);
  });
  return [...merged.values()].join("; ");
}

function extractCadastruSessionId(text) {
  const value = String(text || "");
  const patterns = [
    /name=["']p_instance["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*name=["']p_instance["']/i,
    /id=["']pInstance["'][^>]*value=["']([^"']+)["']/i,
    /value=["']([^"']+)["'][^>]*id=["']pInstance["']/i,
    /\bAPP_SESSION\s*:\s*["']([0-9]+)["']/i,
    /p_context=100:1:([0-9]+)/i,
    /f\?p=100:1:([0-9]+)/i,
    /value=["']100(?:&#x3A;|:)1(?:&#x3A;|:)([0-9]+)["'][^>]*id=["']pContext["']/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractHtmlTitle(text) {
  const match = String(text || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 120) : null;
}

async function createCadastruSession() {
  const attempts = [];
  let cookieHeader = "";

  for (const entryUrl of CADASTRU_SESSION_URLS) {
    for (const retryWithCookies of [false, true]) {
      if (retryWithCookies && !cookieHeader) continue;

      try {
        const { text, headers, status, url } = await fetchText(entryUrl, {
          headers: {
            "User-Agent": CADASTRU_USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
        });
        const responseCookies = splitSetCookieHeader(headers.get("set-cookie"));
        if (responseCookies.length) cookieHeader = mergeCookieHeader(cookieHeader, responseCookies);

        const pInstance = extractCadastruSessionId(text);
        if (pInstance) {
          return { pInstance, cookieHeader, pageUrl: url || entryUrl };
        }

        attempts.push({
          entryUrl,
          finalUrl: url || entryUrl,
          retryWithCookies,
          status,
          contentType: headers.get("content-type"),
          title: extractHtmlTitle(text),
          length: text.length,
          preview: stripHtml(text).slice(0, 120),
        });
      } catch (error) {
        attempts.push({
          entryUrl,
          retryWithCookies,
          error: error?.message || String(error),
        });
      }
    }
  }

  const details = attempts
    .map((attempt) => {
      const retry = attempt.retryWithCookies ? " with cookies" : "";
      if (attempt.error) return `${attempt.entryUrl}${retry} failed: ${attempt.error}`;
      return `${attempt.entryUrl}${retry} -> ${attempt.finalUrl} status=${attempt.status} type=${attempt.contentType || "unknown"} title=${attempt.title || "none"} length=${attempt.length} preview=${attempt.preview || "none"}`;
    })
    .join("; ");

  throw new Error(`Could not extract cadastru.md p_instance: ${details}`);
}

async function callCadastruApex(session, procName, params) {
  const body = new URLSearchParams({
    p_request: `APPLICATION_PROCESS=${procName}`,
    p_instance: session.pInstance,
    p_flow_id: "100",
    p_flow_step_id: "1",
  });
  params.forEach((value, index) => body.set(`x${String(index + 1).padStart(2, "0")}`, String(value ?? "")));

  const { text } = await fetchText(`${CADASTRU_APEX_URL}?p_context=100:1:${session.pInstance}`, {
    method: "POST",
    headers: {
      "User-Agent": CADASTRU_USER_AGENT,
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://www.cadastru.md",
      Referer: session.pageUrl || CADASTRU_PAGE_URL,
      ...(session.cookieHeader ? { Cookie: session.cookieHeader } : {}),
    },
    body,
  });
  return text;
}

function parseCadastruSearchResults(text, parsed) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^([0-9.]+)\s*:\s*(.+)$/);
      if (!match) return null;
      const code = compactParcelCode(match[1]);
      if (!code) return null;
      return {
        code,
        raw_code: match[1],
        address: normalizeSpaces(match[2]),
      };
    })
    .filter(Boolean)
    .filter((candidate) => addressMatchesParsedBuilding(candidate.address, parsed));
}

function responseTextToHtml(text) {
  try {
    const json = JSON.parse(text);
    if (typeof json === "string") return json;
    if (typeof json?.html === "string") return json.html;
    if (typeof json?.result === "string") return json.result;
    return JSON.stringify(json);
  } catch {
    return text;
  }
}

function extractCadastruInfoSections(html) {
  const matches = [...String(html || "").matchAll(/<div[^>]*class=["'][^"']*\binfoConstr\b[^"']*["'][^>]*>/gi)];
  if (!matches.length) return [html];

  return matches.map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? html.length;
    return html.slice(start, end);
  });
}

function extractCadastruSectionAddress(section) {
  const match =
    section.match(/Adresa\/locul amplasării:\s*([\s\S]*?)(?:<br\s*\/?>|<\/li>|<\/div>|$)/i) ||
    section.match(/Adresa:\s*([\s\S]*?)(?:<br\s*\/?>|<\/li>|<\/div>|$)/i);
  return match ? stripHtml(match[1]) : null;
}

function extractCadastruApartmentLinks(section) {
  const links = [];
  const linkRe = /getDetailedInfo\(["']([0-9.]+)["']\s*,\s*3\s*\)[^>]*>\s*<i[^>]*>([\s\S]*?)<\/i>/gi;
  let match;

  while ((match = linkRe.exec(section))) {
    links.push({
      cadastralNumber: displayCadastralNumber(match[1]),
      raw_cadastral_number: match[1],
      label: stripHtml(match[2]),
    });
  }

  return links;
}

function findApartmentInCadastruHtml(html, parsed) {
  const sections = extractCadastruInfoSections(html);

  for (const section of sections) {
    const address = extractCadastruSectionAddress(section);
    if (address && !addressMatchesParsedBuilding(address, parsed)) continue;

    const matches = extractCadastruApartmentLinks(section)
      .map((link) => ({
        ...link,
        matched_address: address,
        labelKey: normalizeApartmentKey(link.label),
        suffixKey: normalizeApartmentKey(link.cadastralNumber.split(".").at(-1)),
      }))
      .filter((link) => link.labelKey === parsed.apartmentKey || link.suffixKey === parsed.apartmentKey);

    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(`Ambiguous cadastru.md apartment match for ap ${parsed.apartment}: ${matches.map((item) => item.cadastralNumber).join(", ")}`);
    }
  }

  return null;
}

async function findViaCadastruMd(parsed) {
  if (!parsed.streetName || !parsed.houseNumber) return null;

  const session = await createCadastruSession();
  const candidatesByCode = new Map();

  for (const query of buildCadastruSearchQueries(parsed)) {
    const rawSearch = await callCadastruApex(session, "jQuery_Auto", [query, "f", "25", "1"]);
    const candidates = parseCadastruSearchResults(rawSearch, parsed);
    for (const candidate of candidates) {
      if (!candidatesByCode.has(candidate.code)) candidatesByCode.set(candidate.code, candidate);
    }
  }

  const candidates = [...candidatesByCode.values()];
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    const rawRbi = await callCadastruApex(session, "GET_INFO_RBI", [candidate.code, CADASTRU_LAYERS]);
    const html = responseTextToHtml(rawRbi);
    const match = findApartmentInCadastruHtml(html, parsed);
    if (!match) {
      console.error(`No cadastru.md apartment match for parcel ${candidate.raw_code} (${candidate.address}).`);
      continue;
    }

    return {
      status: "success",
      source: "cadastru_md_apex",
      cadastral_number: match.cadastralNumber,
      raw_cadastral_number: match.raw_cadastral_number,
      matched_address: match.matched_address || candidate.address,
      apartment: parsed.apartment,
      cadastru_search_candidate: candidate,
      parsed_input: parsed,
      raw_response_preview: stripHtml(html).slice(0, 1000),
    };
  }

  return null;
}

export async function fetchCadastruDetailData(cadastralNumber) {
  const lookupNumber = displayCadastralNumber(cadastralNumber);
  const session = await createCadastruSession();
  const rawDetail = await callCadastruApex(session, "GET_DETAIL_DATA", [lookupNumber, "3"]);
  const html = responseTextToHtml(rawDetail);
  const detail = parseCadastruDetailHtml(html);

  if (!detail) return null;

  return {
    status: "success",
    source: "cadastru_md_detail",
    cadastral_number: String(cadastralNumber || "").trim(),
    official_cadastral_number: detail.raw_cadastral_number || lookupNumber,
    raw_cadastral_number: detail.raw_cadastral_number || lookupNumber,
    building: {},
    apartment: detail.apartment,
    matched_address: detail.apartment.address,
    raw_response_preview: detail.raw_response_preview,
  };
}

function parseOfficialSections(html) {
  const sections = [];
  const summaryRe = /<summary[\s\S]*?<strong>([0-9.]+)<\/strong>[\s\S]*?<\/summary>/gi;
  let match;

  while ((match = summaryRe.exec(html))) {
    const cadastralNumber = match[1];
    const start = match.index + match[0].length;
    const end = html.indexOf("</details>", start);
    const section = html.slice(start, end === -1 ? start + 2500 : end);

    sections.push({
      cadastralNumber,
      section,
      isApartment: /\.\d{2}\.\d{3}$/.test(cadastralNumber),
      address:
        extractStrictLiValue(section, "Adresa/locul amplasării:") ||
        extractStrictLiValue(section, "Adresa:"),
      area_m2:
        extractStrictLiValue(section, "Suprafața conform *RBI, m.p.:") ||
        extractStrictLiValue(section, "Suprafața conform") ||
        extractStrictLiValue(section, "Suprafața, m.p.:"),
      floor: extractStrictLiValue(section, "Etajul amplasării:"),
      type: extractStrictLiValue(section, "Tipul încăperii:"),
      estimated_value_lei: extractStrictLiValue(section, "Valoarea estimată, lei:"),
    });
  }

  return sections;
}

function findApartmentMatch(html, parsed) {
  const sections = parseOfficialSections(html);
  const buildings = sections.filter((section) => !section.isApartment);
  const exactBuildings = buildings.filter((building) => addressMatchesParsedBuilding(building.address, parsed));
  const apartments = sections
    .filter((section) => section.isApartment)
    .filter((apartment) => {
      if (!apartment.address) return exactBuildings.length > 0;
      return addressMatchesParsedBuilding(apartment.address, parsed);
    });

  const matches = apartments
    .map((apartment) => {
      const officialApartmentKey = extractOfficialApartmentFromAddress(apartment.address);
      const suffixKey = normalizeApartmentKey(apartment.cadastralNumber.split(".").at(-1));
      let score = 0;
      if (officialApartmentKey && officialApartmentKey === parsed.apartmentKey) score += 100;
      if (suffixKey === parsed.apartmentKey) score += 20;
      if (apartment.address && parsed.houseNumber && normalizeForMatch(apartment.address).includes(normalizeForMatch(parsed.houseNumber))) {
        score += 10;
      }
      return {
        ...apartment,
        officialApartmentKey,
        suffixKey,
        score,
      };
    })
    .filter((apartment) => apartment.score >= 100)
    .sort((a, b) => b.score - a.score);

  if (!matches.length) {
    return { match: null, buildings, apartments };
  }

  const best = matches[0];
  const tied = matches.filter((candidate) => candidate.score === best.score);
  if (tied.length > 1) {
    return { match: null, ambiguous: tied, buildings, apartments };
  }

  return { match: best, buildings, apartments };
}

function findDerivedApartmentMatch(buildings, parsed) {
  const exactBuildings = buildings.filter((building) => addressMatchesParsedBuilding(building.address, parsed));
  const derivedMatches = exactBuildings
    .map((building) => ({
      building,
      cadastralNumber: deriveApartmentCadastralNumber(building.cadastralNumber, parsed),
    }))
    .filter((match) => match.cadastralNumber);

  const uniqueMatches = new Map();
  for (const match of derivedMatches) {
    uniqueMatches.set(match.cadastralNumber, match);
  }

  const matches = [...uniqueMatches.values()];
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Ambiguous exact building match for ${parsed.buildingAddressWithoutCity}: ${matches.map((item) => item.building.cadastralNumber).join(", ")}`);
  }
  return null;
}

function cadastralCodeIsUsable(value) {
  return value && !/^0+$/.test(String(value).replace(/\D/g, ""));
}

async function findDerivedApartmentFromExactGeocode(parsed, geocoded) {
  const exactCandidates = geocoded.filter((candidate) => geocodeMatchesParsedBuilding(candidate, parsed));

  for (const candidate of exactCandidates) {
    const buildingFeatures = containingFeatures(
      await queryWfsByPoint("cad_cladiri", candidate.lon, candidate.lat),
      candidate.lon,
      candidate.lat
    );
    const buildingFeature = buildingFeatures.find((feature) =>
      cadastralCodeIsUsable(feature.properties?.codcadastral_complet)
    );
    const buildingCadastralNumber = buildingFeature?.properties?.codcadastral_complet;
    if (buildingCadastralNumber) {
      const cadastralNumber = deriveApartmentCadastralNumber(buildingCadastralNumber, parsed);
      if (cadastralNumber) {
        return {
          cadastralNumber,
          buildingCadastralNumber,
          candidate,
          source: "geodata_wfs_building_derived",
        };
      }
    }

    const parcelFeatures = containingFeatures(
      await queryWfsByPoint("cad_terenuri", candidate.lon, candidate.lat),
      candidate.lon,
      candidate.lat
    );
    const parcelFeature = parcelFeatures.find((feature) =>
      cadastralCodeIsUsable(feature.properties?.codcadastral)
    );
    const parcelCadastralNumber = parcelFeature?.properties?.codcadastral;
    if (parcelCadastralNumber) {
      const buildingNumber = `${parcelCadastralNumber}.01`;
      const cadastralNumber = deriveApartmentCadastralNumber(buildingNumber, parsed);
      if (cadastralNumber) {
        return {
          cadastralNumber,
          buildingCadastralNumber: buildingNumber,
          parcelCadastralNumber,
          candidate,
          source: "geodata_wfs_parcel_derived",
        };
      }
    }
  }

  return null;
}

export async function findCadastralByAddress(rawAddress) {
  const parsed = parseInputAddress(rawAddress);
  const geocoded = await geocodeBuilding(parsed);

  if (!geocoded.length) {
    console.error(`No geocoding results for building address: ${parsed.buildingAddress}`);
  }

  for (const candidate of geocoded) {
    for (const offset of [30, 60, 100]) {
      const officialFeatures = await queryOfficialHtml(candidate.lon, candidate.lat, offset);
      for (const feature of officialFeatures) {
        const { match, ambiguous, buildings, apartments } = findApartmentMatch(feature.html, parsed);

        if (ambiguous) {
          throw new Error(`Ambiguous apartment match for ap ${parsed.apartment}: ${ambiguous.map((item) => item.cadastralNumber).join(", ")}`);
        }

        if (match) {
          return {
            status: "success",
            source: "geodata_wms",
            cadastral_number: formatCadastralNumber(match.cadastralNumber),
            raw_cadastral_number: match.cadastralNumber,
            matched_address: match.address,
            apartment: parsed.apartment,
            apartment_area_m2: match.area_m2,
            apartment_floor: match.floor,
            apartment_type: match.type,
            estimated_value_lei: match.estimated_value_lei,
            building_cadastral_number: buildings[0]?.cadastralNumber || null,
            building_address: buildings[0]?.address || null,
            geocoded_address: candidate.display_name,
            geocoded_lat: candidate.lat,
            geocoded_lon: candidate.lon,
            geocode_score: candidate.score,
            wms_feature_id: feature.id,
            wms_offset_m: offset,
            parsed_input: parsed,
          };
        }

        const derivedMatch = findDerivedApartmentMatch(buildings, parsed);
        if (derivedMatch) {
          return {
            status: "success",
            source: "geodata_wms_derived",
            cadastral_number: derivedMatch.cadastralNumber,
            raw_cadastral_number: derivedMatch.cadastralNumber,
            matched_address: derivedMatch.building.address,
            apartment: parsed.apartment,
            building_cadastral_number: derivedMatch.building.cadastralNumber,
            building_address: derivedMatch.building.address,
            geocoded_address: candidate.display_name,
            geocoded_lat: candidate.lat,
            geocoded_lon: candidate.lon,
            geocode_score: candidate.score,
            wms_feature_id: feature.id,
            wms_offset_m: offset,
            parsed_input: parsed,
            partial: true,
          };
        }

        console.error(
          `No apartment match at ${candidate.display_name} offset=${offset}; found ${apartments.length} unit sections.`
        );
      }
    }
  }

  const exactGeocodeDerivedMatch = await findDerivedApartmentFromExactGeocode(parsed, geocoded);
  if (exactGeocodeDerivedMatch) {
    return {
      status: "success",
      source: exactGeocodeDerivedMatch.source,
      cadastral_number: exactGeocodeDerivedMatch.cadastralNumber,
      raw_cadastral_number: exactGeocodeDerivedMatch.cadastralNumber,
      matched_address: exactGeocodeDerivedMatch.candidate.display_name,
      apartment: parsed.apartment,
      building_cadastral_number: exactGeocodeDerivedMatch.buildingCadastralNumber,
      parcel_cadastral_number: exactGeocodeDerivedMatch.parcelCadastralNumber || null,
      geocoded_address: exactGeocodeDerivedMatch.candidate.display_name,
      geocoded_lat: exactGeocodeDerivedMatch.candidate.lat,
      geocoded_lon: exactGeocodeDerivedMatch.candidate.lon,
      geocode_score: exactGeocodeDerivedMatch.candidate.score,
      parsed_input: parsed,
      partial: true,
    };
  }

  console.error("No geodata match; trying cadastru.md APEX search.");
  let cadastruError = null;
  try {
    const cadastruMatch = await findViaCadastruMd(parsed);
    if (cadastruMatch) return cadastruMatch;
  } catch (error) {
    cadastruError = error;
    console.error(`cadastru.md fallback failed: ${error.message}`);
  }

  const suffix = cadastruError ? ` cadastru.md fallback error: ${cadastruError.message}` : "";
  throw new Error(`Could not match apartment ${parsed.apartment} after ${geocoded.length} geocoding candidates.${suffix}`);
}

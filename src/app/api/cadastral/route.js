import { rateLimit } from "@/lib/rate-limit";
import { matchDistrict, CADASTRAL_RE } from "@/lib/validation";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 15 });

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
  const res = await fetch(url, {
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

  const { code, buildingId, apartmentId } = parseCadastralParts(trimmed);

  try {
    const step1Url = `https://geodata.gov.md/geoserver/w_cbi/wfs?service=WFS&version=1.1.0&request=GetFeature&outputFormat=application%2Fjson&maxFeatures=5&typeName=cad_terenuri&cql_filter=(codcadastral+LIKE+%27%25${code}%25%27)&sortBy=codcadastral&srsName=EPSG:4326`;
    const step1 = await fetch(step1Url).then((r) => r.json());

    if (!step1.features || step1.features.length === 0) {
      return NextResponse.json(
        { error: "not_found", message: "Cadastral number not found" },
        { status: 404 }
      );
    }

    const feature = step1.features[0];
    const { lon, lat } = computeCentroid(feature.geometry.coordinates);
    const { x, y } = toEpsg3857(lon, lat);

    const offset = 30;
    const bbox = `${x - offset},${y - offset},${x + offset},${y + offset}`;

    const step3Url = `https://geodata.gov.md/geoserver/contestare/wms?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=S1&query_layers=S1&x=51&y=51&height=101&width=101&srs=EPSG:3857&bbox=${bbox}&feature_count=10&info_format=application%2Fjson&ENV=mapstore_language:en`;
    const step3 = await fetch(step3Url).then((r) => r.json());

    if (!step3.features || step3.features.length === 0) {

      const nominatim = await fallbackNominatim(lat, lon);
      if (!nominatim?.address) {
        return NextResponse.json(
          { error: "not_found", message: "No property data found for this cadastral number" },
          { status: 404 }
        );
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


      const res = NextResponse.json({
        cadastral_number: trimmed,
        building: {},
        apartment: {},
        location,
        form_fields,
        partial: true,
        access_tier: "free",
        locked_sections: {},
      });
      res.headers.set("X-RateLimit-Remaining", String(remaining));
      return res;
    }

    const html = step3.features[0].properties?.html || "";
    const { building, apartment } = parseHtmlResponse(html, buildingId, apartmentId);
    const form_fields = buildFormFields(building, apartment);

    const payload = {
      cadastral_number: trimmed,
      building,
      apartment,
      form_fields,
      access_tier: "free",
      locked_sections: {},
    };

    const res = NextResponse.json(payload);
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    return res;
  } catch (err) {
    console.error("[cadastral] Fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch cadastral data" },
      { status: 502 }
    );
  }
}

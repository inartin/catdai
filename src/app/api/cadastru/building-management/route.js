import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { isFreshCadastru } from "@/lib/cadastru-cache";
import { fetchExternalBuildingManagementData } from "@/lib/cadastru-external-api";
import { cadastruLocationOriginKey, createCadastruLocationStore } from "@/lib/cadastru-location-storage";
import { nearbyAddressFromCadastru } from "@/lib/cadastru-nearby";
import { getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { scheduleCadastruRefresh } from "@/lib/cadastru-refresh";
import { getCadastruSharedReport } from "@/lib/cadastru-share-metadata";
import { checkFeatureAccess, makePaidFeatureUsageKey } from "@/lib/paid-feature-usage";
import { rateLimit } from "@/lib/rate-limit";
import { validateCadastralNumber } from "@/lib/validation";

const limiter = rateLimit({ interval: 60_000, limit: 15, namespace: "cadastru-building-management" });
const ROAD_TYPES = new Set(["strada", "str-la", "bulevard", "sos"]);
const HOUSE_NUMBER_PATTERN = /^\d{1,4}(?:[a-z]|\/(?:[a-z]|\d{1,4}[a-z]?))?$/i;
const isBuildingManager = (contact) => contact?.category === "building_management" && contact.scope === "building"
  && typeof contact.name === "string" && Boolean(contact.name.trim());
const storage = createCadastruLocationStore({
  name: "building-management",
  table: "cadastru_building_management",
  ttlSeconds: 30 * 24 * 60 * 60,
  isValid: (payload) => Array.isArray(payload?.contacts) && payload.contacts.every(isBuildingManager),
});

async function refreshBuildingManagement(address) {
  const result = await fetchExternalBuildingManagementData(address);
  if (!Array.isArray(result?.contacts) || result.contacts.some((contact) => (
    !isBuildingManager(contact) && !(contact?.category === "municipal_housing_enquiries" && ["city", "sector"].includes(contact.scope))
  ))) throw new Error("Invalid building management response");
  const payload = { contacts: result.contacts.filter(isBuildingManager) };
  await storage.store(address, payload);
  return payload;
}

function respond({ contacts }, unlocked) {
  return NextResponse.json({ contacts: unlocked ? contacts : contacts.map((contact) => ({
    name: contact.name,
    has_office_address: Boolean(contact.office_address),
    phone_count: Array.isArray(contact.phones) ? contact.phones.length : 0,
    locked: Boolean(contact.office_address || contact.phones?.length || contact.phone_source_address
      || contact.assignment?.status === "unverified"),
  })) }, { headers: { "Cache-Control": "private, no-store" } });
}

async function canReadContacts(request, number) {
  if (!number || !request.headers.has("authorization")) return false;
  try {
    const { user_id: userId } = await resolveAccessTier(request);
    if (!userId) return false;
    const featureKey = "cadastru_lookup";
    const access = await checkFeatureAccess({ userId, featureKey,
      idempotencyKey: makePaidFeatureUsageKey(featureKey, { cadastral_number: number }) });
    return access.allowed && access.reason === "already_consumed";
  } catch {
    return false;
  }
}

export async function POST(request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, retryAfter } = limiter.check(ip);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const body = await request.json().catch(() => null);
  const number = validateCadastralNumber(typeof body?.cadastral_number === "string" ? body.cadastral_number : "").value;
  let origin = body;
  let unlocked = false;
  try {
    if (body?.share_slug) {
      const report = await getCadastruSharedReport(body.share_slug);
      if (!report) return NextResponse.json({ error: "shared_report_not_found" }, { status: 404 });
      origin = nearbyAddressFromCadastru(report.payload);
      unlocked = true;
    } else if (number) {
      const entry = await getCadastruRecordByNumber(number, { allowExpired: true });
      const storedAddress = nearbyAddressFromCadastru(entry?.payload);
      if (storedAddress) {
        origin = storedAddress;
        unlocked = await canReadContacts(request, number);
      }
    }
  } catch {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const city = typeof origin?.city === "string" ? origin.city.trim() : "";
  const street = typeof origin?.street === "string" ? origin.street.trim() : "";
  const roadType = origin?.road_type;
  const houseNumber = typeof origin?.house_number === "string" ? origin.house_number.trim().replace(/\s*\/\s*/g, "/").toUpperCase() : "";
  if (!city || city.length > 160 || !street || street.length > 80 || !ROAD_TYPES.has(roadType) || !HOUSE_NUMBER_PATTERN.test(houseNumber)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const address = { city, street, road_type: roadType, house_number: houseNumber };
  const stored = await storage.get(address);
  if (stored) {
    if (!isFreshCadastru(stored.expiresAt)) {
      scheduleCadastruRefresh(`building-management:${cadastruLocationOriginKey(address)}`, async () => {
        try {
          await refreshBuildingManagement(address);
        } catch (error) {
          if (error.code !== "not_found") throw error;
        }
      });
    }
    return respond(stored.payload, unlocked);
  }

  try {
    return respond(await refreshBuildingManagement(address), unlocked);
  } catch (error) {
    if (error.code === "not_found") return NextResponse.json({ contacts: [] });
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }
}

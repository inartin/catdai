import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { consumePaidFeatureCredit, getPaidFeatureUsageEvent, getUserFeatureCreditBalance, makePaidFeatureUsageKey } from "@/lib/paid-feature-usage";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { withCadastruFreshness } from "@/lib/cadastru-cache";
import { nearbyAddressFromCadastru, nearbyInputFromCadastru, validNearbyResult } from "@/lib/cadastru-nearby";
import { nearbyFromStorage, getStoredNearby } from "@/lib/cadastru-nearby-storage";
import { publicTransportInputFromCadastru } from "@/lib/cadastru-public-transport";
import { publicTransportFromStorage, getStoredPublicTransport } from "@/lib/cadastru-public-transport-storage";
import { municipalReportsAvailableForCadastru, municipalReportsInputFromCadastru } from "@/lib/cadastru-municipal-reports";
import { municipalReportsFromStorage, getStoredMunicipalReports } from "@/lib/cadastru-municipal-reports-storage";
import { cadastruMapLocation } from "@/lib/cadastru-map";
import { renderCadastruReportMap } from "@/lib/cadastru-map-preview";
import { loadCadastruMarket } from "@/lib/cadastru-market";
import { validateCadastralNumber } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { renderCadastruReport } from "@/lib/cadastru-report-pdf";
import { normalizeLanguage } from "@/lib/language";
import { environment as maibEnvironment } from "@/lib/maib/client.mjs";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";
import en from "@/locales/en.json";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store" };
const featureKey = "cadastru_lookup";
const localeMessages = { ro, ru, en };
const limiter = rateLimit({ interval: 60_000, limit: 12, namespace: "cadastru-pdf" });
const usageKeyFor = (number, address) => makePaidFeatureUsageKey(featureKey,
  number ? { cadastral_number: number } : { address: address.toLowerCase() });

function json(data, status, headers = {}) {
  return NextResponse.json(data, { status, headers: { ...noStore, ...headers } });
}

async function paidOrder(userId, { orderId, delivery }) {
  let query = supabaseAdmin.from("maib_payment_orders").select(orderId ? "id" : "id, cadastru_delivery")
    .eq("user_id", userId).eq("environment", maibEnvironment())
    .in("status", ["paid", "partially_refunded"]).not("paid_at", "is", null);
  query = orderId ? query.eq("id", orderId)
    : query.eq("product_key", "cadastru_lookup_single").contains("cadastru_delivery", delivery);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

async function hasPaidLookup(userId, key) {
  if (!userId || !key) return false;
  const usage = await getPaidFeatureUsageEvent({ userId, featureKey, idempotencyKey: key, includeMetadata: true });
  if (usage?.source !== "paid_credit") return false;
  const orderId = usage.metadata?.maib_order_id;
  return !orderId || Boolean(await paidOrder(userId, { orderId }));
}

async function readReport(body, userId) {
  if (body.share_slug) {
    if (typeof body.share_slug !== "string" || !/^[a-f0-9]{48}$/.test(body.share_slug)) return null;
    const { data, error } = await supabaseAdmin.from("cadastru_shared_reports")
      .select("payload,sharer_user_id").eq("slug", body.share_slug).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { payload, sharer_user_id: owner } = data;
    const number = validateCadastralNumber(payload?.cadastral_number).value;
    const address = String(payload?.resolved_address || payload?.request_address || "").replace(/\s+/g, " ").trim();
    const key = number || address ? usageKeyFor(number, address) : null;
    const receipt = await paidOrder(owner, { delivery: { slug: body.share_slug } });
    const usageKey = receipt?.cadastru_delivery?.usage_key || key;
    const paid = await hasPaidLookup(owner, usageKey);
    const confirmedPurchase = !paid && (receipt || (key && await paidOrder(owner, { delivery: { usage_key: key } })));
    return { payload, paid, key: usageKey, owner, number, address, confirmedPurchase };
  }

  const rawNumber = typeof body.cadastral_number === "string" ? body.cadastral_number : "";
  const number = validateCadastralNumber(rawNumber).value;
  const address = typeof body.address === "string" ? body.address.replace(/\s+/g, " ").trim() : "";
  if ((rawNumber && !number) || (!number && !address) || address.length > 500) return null;
  const entry = number
    ? await getCadastruRecordByNumber(number, { allowExpired: true, requireDetailPayload: true })
    : await getCadastruRecordByAddress(address, { allowExpired: true, requireUnitDetails: true });
  if (!entry) return null;
  const payload = withCadastruFreshness(entry);
  const savedNumber = validateCadastralNumber(payload.cadastral_number).value;
  if (number && savedNumber && number !== savedNumber) return null;
  const key = usageKeyFor(number || savedNumber, address);
  const paid = await hasPaidLookup(userId, key);
  const confirmedPurchase = !paid && await paidOrder(userId, { delivery: { usage_key: key } });
  return { payload, paid, key, owner: userId, number: number || savedNumber, address, confirmedPurchase };
}

async function fromStorage(input, get, toResponse) {
  if (!input) return null;
  const entry = await get(input);
  return entry ? toResponse(entry) : null;
}

async function renderReport(payload, lang) {
  const mapLocation = cadastruMapLocation(payload);
  const reportsAvailable = municipalReportsAvailableForCadastru(payload);
  const [nearby, transport, reports, market, mapImage] = await Promise.all([
    fromStorage(nearbyInputFromCadastru(payload), getStoredNearby, nearbyFromStorage).catch(() => null),
    fromStorage(publicTransportInputFromCadastru(payload), getStoredPublicTransport, publicTransportFromStorage).catch(() => null),
    fromStorage(municipalReportsInputFromCadastru(payload), getStoredMunicipalReports, municipalReportsFromStorage).catch(() => null),
    loadCadastruMarket(supabaseAdmin, { payload }).catch(() => null),
    mapLocation ? renderCadastruReportMap(payload).catch(() => null) : null,
  ]);
  const t = (key, vars = {}) => Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    localeMessages[lang][key] ?? ro[key] ?? key
  );
  return renderCadastruReport({ cadastral: payload, mapLocation, mapImage,
    nearby: nearby || (validNearbyResult(payload.nearby) ? payload.nearby : null),
    transport, reports, reportsAvailable, market, lang, t });
}

export async function POST(request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = limiter.check(ip);
  if (!limit.allowed) return json({ error: "rate_limited" }, 429, { "Retry-After": String(limit.retryAfter) });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "invalid_search" }, 400);

  try {
    const { user_id: userId } = await resolveAccessTier(request);
    if (!userId && !body.share_slug) return json({ error: "purchase_required" }, 402);
    const report = await readReport(body, userId);
    const payload = report?.payload;
    if (!payload || payload.error || payload.full_access === false || payload.locked_sections?.cadastru_details
      || (payload.status && payload.status !== "success")) {
      return json({ error: "result_not_found" }, 404);
    }

    const canApplyCredit = Boolean(!body.share_slug && userId && report.key && !payload.registry_unavailable);
    if (!report.paid) {
      if (body.check_only === true && report.confirmedPurchase) return json({ ok: true }, 200);
      if (body.check_only !== true && report.key && !payload.registry_unavailable
        && (report.confirmedPurchase || (canApplyCredit && body.use_paid_credit === true))) {
        // Older receipt deliveries can have used the free balance first. Spend
        // one paid credit for this lookup before generating its paid export.
        const usage = await consumePaidFeatureCredit({
          userId: report.owner, featureKey, idempotencyKey: report.key,
          metadata: { feature: featureKey, cadastral_number: report.number || null,
            raw_address: report.address || null, search_type: report.number ? "number" : "address", search_context: "cadastru",
            search_request: report.number ? null : nearbyAddressFromCadastru(payload) },
        });
        report.paid = usage.allowed && await hasPaidLookup(report.owner, report.key);
      }
      if (!report.paid) {
        const balance = canApplyCredit && body.use_paid_credit !== true
          ? await getUserFeatureCreditBalance({ userId, featureKey }) : null;
        return json({ error: "purchase_required", paid_credit_available: Boolean(balance?.remaining_uses) }, 402);
      }
    }
    if (body.check_only === true) return json({ ok: true }, 200);
    const { bytes, fileName } = await renderReport(payload, normalizeLanguage(body.lang));
    return new Response(bytes, {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName}"` },
    });
  } catch (error) {
    console.error("[cadastru/pdf] export failed:", error.message);
    return json({ error: "pdf_unavailable" }, 503);
  }
}

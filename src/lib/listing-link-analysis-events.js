import { resolveAccessTier } from "@/lib/access-tier";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

const STATUSES = new Set([
  "success",
  "unsupported_listing_type",
  "not_chisinau",
  "insufficient_data",
  "not_a_listing",
  "fetch_failed",
  "upstream_blocked",
]);

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function cleanText(value, max = 300) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

export async function logListingLinkAnalysisEvent(request, event) {
  if (!shouldPersistRuntimeData()) return;

  const status = STATUSES.has(event?.status) ? event.status : null;
  if (!status) return;

  let userId = null;
  try {
    const access = await resolveAccessTier(request);
    userId = access.user_id || null;
  } catch (error) {
    console.error("[listing-link-analysis-events] auth lookup failed:", error?.message || String(error));
  }

  try {
    const params = event.params || {};
    const parsed = event.parsed || {};
    const row = {
      status,
      error_code: status === "success" ? null : status,
      user_id: userId,
      external_id: cleanText(event.externalId, 64),
      listing_url: cleanText(event.listingUrl),
      city: cleanText(params.city, 80),
      district: cleanText(params.district, 80),
      rooms_count: cleanInteger(params.rooms),
      listing_price: cleanNumber(parsed.price_amount),
      listing_currency: cleanText(parsed.price_currency, 16),
    };

    const { error } = await supabaseAdmin.from("listing_link_analysis_events").insert(row);
    if (error && !isMissingSchemaError(error)) {
      console.error("[listing-link-analysis-events] insert failed:", error.message);
    }
  } catch (error) {
    console.error("[listing-link-analysis-events] insert failed:", error?.message || String(error));
  }
}

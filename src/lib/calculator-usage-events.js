import { resolveAccessTier } from "@/lib/access-tier";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function cleanText(value, max = 120) {
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

function calculateYieldMetrics(monthlyRent, calculator) {
  const apartmentPrice = cleanNumber(calculator?.apartment_price);
  const additionalInvestments = cleanNumber(calculator?.additional_investments) || 0;
  const totalInvestment = apartmentPrice != null ? apartmentPrice + additionalInvestments : null;
  const annualGrossRent = monthlyRent != null ? monthlyRent * 12 : null;
  const monthlyTax = calculator?.include_rent_tax === true && monthlyRent != null ? monthlyRent * 0.07 : 0;
  const annualEffectiveRent = annualGrossRent != null ? annualGrossRent - monthlyTax * 12 : null;

  return {
    apartmentPrice,
    additionalInvestments,
    totalInvestment,
    annualGrossYieldPct: annualGrossRent != null && totalInvestment > 0
      ? (annualGrossRent / totalInvestment) * 100
      : null,
    effectiveYieldPct: annualEffectiveRent != null && totalInvestment > 0
      ? (annualEffectiveRent / totalInvestment) * 100
      : null,
    paybackYears: annualEffectiveRent != null && annualEffectiveRent > 0 && totalInvestment != null
      ? totalInvestment / annualEffectiveRent
      : null,
  };
}

export async function logCalculatorUsageEvent(request, event) {
  if (!shouldPersistRuntimeData()) return;
  if (!event?.calculator_usage) return;

  const calculator = event.calculator_usage;
  const monthlyRent = cleanNumber(event.data?.estimate?.market_rate);
  const metrics = calculateYieldMetrics(monthlyRent, calculator);

  if (metrics.apartmentPrice == null || metrics.apartmentPrice <= 0) return;

  let userId = null;
  try {
    const access = await resolveAccessTier(request);
    userId = access.user_id || null;
  } catch (error) {
    console.error("[calculator-usage-events] auth lookup failed:", error?.message || String(error));
  }

  try {
    const row = {
      event_id: cleanText(calculator.event_id, 80),
      user_id: userId,
      device_id: cleanText(calculator.device_id, 80),
      session_id: cleanText(calculator.session_id, 80),
      city: cleanText(event.params?.p_city, 80),
      district: Array.isArray(event.params?.p_districts)
        ? cleanText(event.params.p_districts.join(", "), 200)
        : null,
      rooms_count: cleanInteger(event.params?.p_rooms_count),
      area_m2: cleanNumber(event.params?.p_area_m2),
      building_type: Array.isArray(event.params?.p_building_types)
        ? cleanText(event.params.p_building_types.join(", "), 200)
        : null,
      renovation: cleanText(event.params?.p_renovation, 120),
      apartment_price: metrics.apartmentPrice,
      additional_investments: metrics.additionalInvestments,
      total_investment: metrics.totalInvestment,
      include_rent_tax: calculator.include_rent_tax === true,
      estimated_monthly_rent: monthlyRent,
      annual_gross_yield_pct: metrics.annualGrossYieldPct,
      effective_yield_pct: metrics.effectiveYieldPct,
      payback_years: metrics.paybackYears,
      language: cleanText(calculator.language, 12),
    };

    let query = supabaseAdmin.from("calculator_usage_events").insert(row);
    if (row.event_id) query = query.select("id").maybeSingle();
    const { error } = await query;

    if (error?.code === "23505" && row.event_id) return;
    if (error && !isMissingSchemaError(error)) {
      console.error("[calculator-usage-events] insert failed:", error.message);
    }
  } catch (error) {
    console.error("[calculator-usage-events] insert failed:", error?.message || String(error));
  }
}

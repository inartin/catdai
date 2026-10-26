import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { validateCadastralNumber, matchCity, matchDistrict } from "@/lib/validation";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { loadCadastruMarket } from "@/lib/cadastru-market";

const limiter = rateLimit({ interval: 60000, limit: 15, namespace: "cadastru-market" });

export async function POST(request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, retryAfter } = limiter.check(ip);
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const number = validateCadastralNumber(typeof body?.cadastral_number === "string" ? body.cadastral_number : "");
  const city = typeof body?.city === "string" ? matchCity(body.city) : null;
  const district = typeof body?.district === "string" && city === "Chișinău" ? matchDistrict(body.district, city) : null;
  if (address.length > 500 || (!address && !number.valid && !district)) return NextResponse.json({ error: "invalid_search" }, { status: 400 });
  const key = `catdai:cadastru-market:v4:${JSON.stringify([address, number.valid ? number.value : "", city, district])}`;
  const cached = await getSharedCache(key);
  if (cached) return NextResponse.json({ market: cached.value });
  try {
    let entry = null;
    // Read saved registry context only; never start another cadastral lookup.
    try {
      if (address) entry = await getCadastruRecordByAddress(address, { allowExpired: true });
      if (!entry && number.valid) entry = await getCadastruRecordByNumber(number.value, { allowExpired: true });
    } catch (error) { console.error("[cadastru/market] stored context unavailable:", error.message); }
    const market = await loadCadastruMarket(supabaseAdmin, { payload: entry?.payload, address, city, district });
    if (market) await setSharedCache(key, market, 3600);
    return NextResponse.json({ market });
  } catch (error) {
    console.error("[cadastru/market] unavailable:", error.message);
    return NextResponse.json({ market: null });
  }
}

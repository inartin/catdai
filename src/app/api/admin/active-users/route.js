import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { adminPeriod, chisinauDateKey } from "@/lib/admin-periods";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSharedCache, setSharedCache } from "@/lib/cache";

const headers = { "Cache-Control": "private, no-store" };
const CACHE_TTL_SECONDS = 5 * 60;

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const params = request.nextUrl.searchParams;
  const { period, since, until } = adminPeriod(params.get("period"));
  // Rolling weeks share a key within the TTL; calendar periods roll over locally.
  const boundary = period === "week" || period === "all" ? chisinauDateKey(new Date()) : since;
  const cacheKey = `catdai:admin-active-users:v1:${period}:${boundary}:${until || "open"}`;
  try {
    if (params.get("fresh") !== "1") {
      const cached = await getSharedCache(cacheKey);
      if (cached?.value) return NextResponse.json(cached.value, { headers });
    }
    const { data, error } = await supabaseAdmin.rpc("admin_active_users_chart", {
      p_since: since, p_until: until, p_hourly: period === "day",
    });
    if (error || !data || !Array.isArray(data.dailyActiveUsers)) {
      throw new Error(error?.message || "Missing active-user chart data");
    }
    const payload = {
      ...data, period, since, until,
      dailyActiveUsersType: period === "day" ? "hourly" : "daily",
      updatedAt: new Date().toISOString(),
    };
    await setSharedCache(cacheKey, payload, CACHE_TTL_SECONDS);
    return NextResponse.json(payload, { headers });
  } catch (error) {
    console.error("[admin-active-users]", error.message);
    return NextResponse.json({ error: "Active-user chart is unavailable. Please try again." }, { status: 503, headers });
  }
}

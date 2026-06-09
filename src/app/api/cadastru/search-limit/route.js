import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { getUserCadastruDailySearchStatus } from "@/lib/cadastru-search-events";

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
  }

  try {
    const status = await getUserCadastruDailySearchStatus(access.user_id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("[cadastru/search-limit] lookup failed:", error?.message || String(error));
    return NextResponse.json({ error: "limit_check_failed", message: "Could not verify search limit." }, { status: 500 });
  }
}

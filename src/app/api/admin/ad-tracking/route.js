import { fetchZdgAdStats } from "@/lib/admin-ad-tracking";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const journeyLimit = request.nextUrl.searchParams.get("limit");
  const journeyOffset = request.nextUrl.searchParams.get("offset");
  const zdgAd = await fetchZdgAdStats({ journeyLimit, journeyOffset });

  return NextResponse.json({ zdgAd });
}

import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { fetchCollectorStatus } from "@/lib/admin-collector-status";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await fetchCollectorStatus(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ available: false }, { headers: { "Cache-Control": "private, no-store" } });
  }
}

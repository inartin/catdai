import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 30 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

export async function POST(request) {
  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many PDF generation attempts." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}

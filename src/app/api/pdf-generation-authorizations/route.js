import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import {
  buildFeatureCreditRequiredPayload,
  consumePaidFeatureCredit,
  makePaidFeatureUsageKey,
} from "@/lib/paid-feature-usage";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const PDF_REPORT_FEATURE_KEY = "pdf_report";

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

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body?.report_key || typeof body.report_key !== "object") {
    return NextResponse.json({ error: "report_key_required" }, { status: 400 });
  }

  const usage = await consumePaidFeatureCredit({
    userId: access.user_id,
    featureKey: PDF_REPORT_FEATURE_KEY,
    idempotencyKey: makePaidFeatureUsageKey(PDF_REPORT_FEATURE_KEY, body.report_key),
    metadata: {
      feature: "pdf_report",
      report_key: body.report_key,
    },
  });

  if (!usage.allowed) {
    return NextResponse.json(
      buildFeatureCreditRequiredPayload(PDF_REPORT_FEATURE_KEY, usage.reason || "no_credit"),
      { status: usage.reason === "unauthorized" ? 401 : 402 }
    );
  }

  return NextResponse.json({
    ok: true,
    paid_credit_usage: {
      remaining: usage.remaining_uses,
    },
  });
}

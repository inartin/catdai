import { getOnlineUserCount } from "@/lib/online-users";
import { getCanonicalSiteUrl } from "@/lib/seo";
import { getStatisticsVisitor, shouldCollectStatistics, withStatisticsContext } from "@/lib/statistics-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textResponse(value, status = 200) {
  return new Response(String(value), {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function countResponse(deviceId = null) {
  try {
    return textResponse(await getOnlineUserCount(deviceId));
  } catch (error) {
    console.error("[online-users] count unavailable:", error.message);
    return textResponse("Unavailable", 503);
  }
}

export async function GET() {
  return countResponse();
}

async function handlePost(request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  // Next.js can normalize request.url to an internal hostname. Also accept the
  // actual request Host and the configured HTTPS origin behind a reverse proxy.
  if (request.headers.get("sec-fetch-site") === "cross-site"
    || (origin && origin !== requestUrl.origin && origin !== `${requestUrl.protocol}//${host}` && origin !== getCanonicalSiteUrl())) {
    return textResponse("Invalid origin", 403);
  }

  if (!shouldCollectStatistics()) return countResponse();
  const visitor = getStatisticsVisitor();
  if (!visitor?.device_id) return textResponse("Browser ID required", 400);
  if (visitor.device_type === "Bot") return countResponse();
  return countResponse(visitor.device_id);
}

export const POST = withStatisticsContext(handlePost);

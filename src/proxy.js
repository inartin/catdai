import { NextResponse } from "next/server";

const ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS || "")
  .split(",")
  .map((ip) => ip.trim())
  .filter(Boolean);

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return request.ip ?? null;
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Language prefix rewrite: /ru/... or /ro/... → serve the actual route
  const langMatch = pathname.match(/^\/(ro|ru)(\/.*)?$/);
  if (langMatch) {
    const rest = langMatch[2] || "/";
    // Don't rewrite API routes
    if (!rest.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = rest;
      return NextResponse.rewrite(url);
    }
  }

  const ip = getClientIp(request);

  const isDev = process.env.NODE_ENV === "development";
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "localhost";

  if (isDev && isLocalhost) {
    return NextResponse.next();
  }

  if (ALLOWED_IPS.length === 0 || !ip || !ALLOWED_IPS.includes(ip)) {
    console.warn(`[proxy] 403 blocked | ip: ${ip} | path: ${pathname}`);
    return new NextResponse("Forbidden", { status: 403 });
  }

  const isLoginPage = pathname === "/admin/login";
  const isAuthApi = pathname === "/api/admin/auth";

  if (!isLoginPage && !isAuthApi) {
    const token = request.cookies.get("admin_token")?.value;
    if (token !== process.env.ADMIN_TOKEN) {
      if (pathname.startsWith("/api/")) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/ro/:path*", "/ru/:path*"],
};

import { NextResponse } from "next/server";

export function proxy(request) {
  const { pathname } = request.nextUrl;

  // Language prefix rewrite: /ru/... or /ro/... → serve the actual route
  const langMatch = pathname.match(/^\/(ro|ru)(\/.*)?$/);
  if (langMatch) {
    // Keep explicit localized FAQ routes as-is (no rewrite), so they can be
    // indexed separately and avoid rewrite/redirect loops with /faq.
    if (/^\/(ro|ru)\/faq\/?$/.test(pathname)) {
      return NextResponse.next();
    }

    const rest = langMatch[2] || "/";
    // Don't rewrite API routes
    if (!rest.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = rest;
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-catdai-lang", langMatch[1]);
      return NextResponse.rewrite(url, {
        request: {
          headers: requestHeaders,
        },
      });
    }
  }

  // Admin routes: secret key + password + cookie token authentication
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const isLoginPage = pathname === "/admin/login";
    const isAuthApi = pathname === "/api/admin/auth";

    // Login page & auth API require a secret key in the URL
    if (isLoginPage || isAuthApi) {
      const key = request.nextUrl.searchParams.get("key");
      if (key !== process.env.ADMIN_LOGIN_KEY) {
        return new NextResponse("Not Found", { status: 404 });
      }
    } else {
      // All other admin routes require a valid session cookie
      const token = request.cookies.get("admin_token")?.value;
      if (token !== process.env.ADMIN_TOKEN) {
        if (pathname.startsWith("/api/")) {
          return new NextResponse("Unauthorized", { status: 401 });
        }
        return new NextResponse("Not Found", { status: 404 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/ro/:path*", "/ru/:path*"],
};

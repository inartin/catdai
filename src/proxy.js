import { NextResponse } from "next/server";

const ADMIN_SESSION_VERSION = "v1";

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64UrlToText(value) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function verifyAdminSessionToken(token) {
  if (!token || !process.env.ADMIN_TOKEN) return false;

  const [version, payload, signature] = token.split(".");
  if (version !== ADMIN_SESSION_VERSION || !payload || !signature) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(process.env.ADMIN_TOKEN),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${ADMIN_SESSION_VERSION}.${payload}`)
    );
    if (!validSignature) return false;

    const session = JSON.parse(base64UrlToText(payload));
    return Number.isFinite(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Language prefix rewrite: /ru/... or /ro/... → serve the actual route
  const langMatch = pathname.match(/^\/(ro|ru)(\/.*)?$/);
  if (langMatch) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-catdai-lang", langMatch[1]);

    if (
      /^\/ro\/preturi-apartamente\/chisinau\/botanica\/?$/.test(pathname) ||
      /^\/ru\/ceny-kvartir\/kishinev\/botanika\/?$/.test(pathname) ||
      /^\/ro\/preturi-apartamente\/chisinau\/botanica-constructii-noi\/?$/.test(pathname) ||
      /^\/ru\/ceny-kvartir\/kishinev\/botanika-novostroy\/?$/.test(pathname)
    ) {
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    // Keep explicit localized FAQ routes as-is (no rewrite), so they can be
    // indexed separately and avoid rewrite/redirect loops with /faq.
    if (/^\/(ro|ru)\/faq\/?$/.test(pathname)) {
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }

    const rest = langMatch[2] || "/";
    // Don't rewrite API routes
    if (!rest.startsWith("/api/")) {
      const url = request.nextUrl.clone();
      url.pathname = rest;
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
      if (!(await verifyAdminSessionToken(token))) {
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

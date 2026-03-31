/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const allowedOrigin = process.env.APP_URL || "";
    const noIndexHeader = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

    return [
      {
        source: "/admin/:path*",
        headers: noIndexHeader,
      },
      {
        source: "/profile/:path*",
        headers: noIndexHeader,
      },
      {
        source: "/evaluare/:path*",
        headers: noIndexHeader,
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com https://*.googleusercontent.com https://*.fbcdn.net https://*.fbsbx.com https://graph.facebook.com",
              "font-src 'self'",
              `connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowedOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
          { key: "Access-Control-Max-Age", value: "86400" },
          ...noIndexHeader,
        ],
      },
    ];
  },
};

export default nextConfig;

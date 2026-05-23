import { Geist } from "next/font/google";
import { LanguageProvider } from "@/context/LanguageContext";
import { AuthProvider } from "@/context/AuthContext";
import CookieBanner from "@/components/CookieBanner";
import { getCanonicalSiteUrl, serializeJsonLd } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL(getCanonicalSiteUrl()),
  title: "Catdai - Înțelege piața imobiliară. Decide corect.",
  description:
    "Pentru vânzători și cumpărători: vezi prețuri realiste și analiza pieței pe criteriile tale (zonă, m², camere, renovare).",
};

export default function RootLayout({ children }) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const googleAdsTagId = "AW-18184166002";
  const googleTagIds = [gaId, googleAdsTagId].filter(Boolean);
  const googleTagScriptId = googleTagIds[0];
  const siteUrl = getCanonicalSiteUrl();

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CatDai",
    url: siteUrl,
    logo: `${siteUrl}/icon1.png`,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "info@catdai.md",
      },
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CatDai",
    url: siteUrl,
    inLanguage: ["ro", "ru"],
  };

  return (
    <html lang="ro">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
        {googleTagScriptId && (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){window.dataLayer.push(arguments);}
                  gtag('consent', 'default', {
                    'analytics_storage': 'denied',
                    'ad_storage': 'denied',
                    'ad_user_data': 'denied',
                    'ad_personalization': 'denied',
                  });
                `,
              }}
            />
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${googleTagScriptId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){window.dataLayer.push(arguments);}
                  gtag('js', new Date());
                  ${googleTagIds
                    .map(
                      (tagId) => `
                  gtag('config', '${tagId}', {
                    page_path: window.location.pathname,
                  });`
                    )
                    .join("")}
                `,
              }}
            />
          </>
        )}
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        <LanguageProvider>
          <AuthProvider>{children}</AuthProvider>
        </LanguageProvider>
        <CookieBanner />
      </body>
    </html>
  );
}

import { serializeJsonLd, toAbsoluteUrl } from "@/lib/seo";

export const metadata = {
  title: "Despre CatDai | Catdai",
  description:
    "Află cum funcționează CatDai, ce surse de date folosim și care este scopul analizelor de piață imobiliară.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutLayout({ children }) {
  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "Despre CatDai",
    url: toAbsoluteUrl("/about"),
    inLanguage: "ro",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(aboutJsonLd) }}
      />
      {children}
    </>
  );
}

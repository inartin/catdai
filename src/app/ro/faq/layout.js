import { serializeJsonLd, toAbsoluteUrl } from "@/lib/seo";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Ce este CatDai și ce tip de rezultat oferă?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CatDai este un serviciu informativ de analiză de piață care oferă estimări orientative de preț, nu evaluări oficiale.",
      },
    },
    {
      "@type": "Question",
      name: "Pe ce date se bazează analiza?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Analiza se bazează pe anunțuri publice, date introduse de utilizator și alte semnale de piață disponibile la momentul căutării.",
      },
    },
    {
      "@type": "Question",
      name: "Este CatDai afiliat cu 999.md, Makler.md sau alte platforme?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Nu. CatDai nu este afiliat, sponsorizat sau partener oficial al acestor platforme decât dacă este indicat explicit în scris.",
      },
    },
    {
      "@type": "Question",
      name: "Datele personale sunt vândute?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Nu. CatDai declară că nu vinde datele personale ale utilizatorilor.",
      },
    },
  ],
};

export const metadata = {
  title: "Întrebări frecvente | Catdai",
  description:
    "FAQ CatDai: cum funcționează estimările, pe ce date se bazează analiza, cum sunt gestionate datele și ce limite are serviciul.",
  alternates: {
    canonical: "/ro/faq",
    languages: {
      ro: "/ro/faq",
      ru: "/ru/faq",
      "x-default": "/ro/faq",
    },
  },
};

export default function RoFaqLayout({ children }) {
  const payload = {
    ...faqJsonLd,
    url: toAbsoluteUrl("/ro/faq"),
    inLanguage: "ro",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(payload) }}
      />
      {children}
    </>
  );
}

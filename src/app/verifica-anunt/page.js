import { headers } from "next/headers";
import Footer from "@/components/Footer";
import ListingAnalyzerPageContent from "@/components/ListingAnalyzerPageContent";
import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/context/LanguageContext";
import { listingPageCopy } from "./content";

async function getPageLanguage() {
  return (await headers()).get("x-catdai-lang") === "ru" ? "ru" : "ro";
}

export async function generateMetadata() {
  const lang = await getPageLanguage();
  const { title, description } = listingPageCopy[lang];
  const canonical = lang === "ru" ? "/ru/verifica-anunt" : "/verifica-anunt";
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { ro: "/verifica-anunt", ru: "/ru/verifica-anunt", "x-default": "/verifica-anunt" },
    },
    openGraph: {
      title, description, url: canonical, siteName: "CatDai", type: "website",
      locale: lang === "ru" ? "ru_MD" : "ro_MD",
      alternateLocale: [lang === "ru" ? "ro_MD" : "ru_MD"],
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function VerificaAnuntPage({ searchParams }) {
  const params = await searchParams;
  const lang = await getPageLanguage();
  return (
    <LanguageProvider key={lang} initialLang={lang}>
      <div lang={lang} className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <main className="flex-1">
          <ListingAnalyzerPageContent showEstimateBack={params?.from === "estimeaza"} />
        </main>
        <Footer />
      </div>
    </LanguageProvider>
  );
}

import Footer from "@/components/Footer";
import ListingAnalyzerPageContent from "@/components/ListingAnalyzerPageContent";
import Navbar from "@/components/Navbar";

const canonicalPath = "/verifica-anunt";

export const metadata = {
  title: "Verifică un anunț 999.md | CatDai",
  description:
    "Lipește linkul unui anunț de pe 999.md și compară prețul cerut cu media pieței pentru apartamente similare din Chișinău.",
  alternates: {
    canonical: canonicalPath,
  },
  openGraph: {
    title: "Verifică prețul unui anunț 999.md",
    description:
      "Compară prețul cerut cu media pieței pentru apartamente similare.",
    url: canonicalPath,
    siteName: "CatDai",
    type: "website",
    locale: "ro_MD",
  },
  twitter: {
    card: "summary",
    title: "Verifică prețul unui anunț 999.md",
    description:
      "Compară prețul cerut cu media pieței pentru apartamente similare.",
  },
};

export default async function VerificaAnuntPage({ searchParams }) {
  const params = await searchParams;
  const showEstimateBack = params?.from === "estimeaza";

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1 px-4 py-12 sm:py-16">
        <ListingAnalyzerPageContent showEstimateBack={showEstimateBack} />
      </main>
      <Footer />
    </div>
  );
}

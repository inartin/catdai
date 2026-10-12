"use client";

import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import CadastruResultLoading from "@/components/CadastruResultLoading";
import { useTranslation } from "@/context/LanguageContext";

export default function CadastruLoadingPage({ onBack, ...search }) {
  const router = useRouter();
  const { lang, t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <BackButton onClick={() => {
            onBack?.();
            router.push(`/${lang}/cadastru`);
          }} className="mb-6">
            {t("cadastru.backToSearch")}
          </BackButton>
          <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
            {t("cadastru.resultPageTitle")}
          </h1>
          <CadastruResultLoading {...search} />
        </section>
      </main>
      <Footer />
    </div>
  );
}

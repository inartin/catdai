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
        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 pb-12 pt-4 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <div className="mb-4 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 sm:mb-6 sm:block">
            <BackButton onClick={() => {
              onBack?.();
              router.push(`/${lang}/cadastru`);
            }} className="col-start-1 row-start-1 max-sm:h-11 max-sm:w-11 max-sm:justify-center max-sm:gap-0 max-sm:rounded-xl max-sm:text-gray-600 max-sm:hover:bg-gray-100 sm:mb-6">
              <span className="sr-only sm:not-sr-only">{t("cadastru.backToSearch")}</span>
            </BackButton>
            <h1 className="col-start-2 row-start-1 text-center text-xl font-bold leading-tight tracking-tight text-gray-950 max-sm:min-w-0 sm:text-left sm:text-4xl sm:font-extrabold sm:leading-10">
              <span className="sm:hidden">{t("cadastru.resultPageTitleMobile")}</span>
              <span className="hidden sm:inline">{t("cadastru.resultPageTitle")}</span>
            </h1>
          </div>
          <CadastruResultLoading {...search} />
        </section>
      </main>
      <Footer />
    </div>
  );
}

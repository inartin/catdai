"use client";

import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import LinkAnalyzer from "@/components/LinkAnalyzer";
import { useTranslation } from "@/context/LanguageContext";

export default function ListingAnalyzerPageContent({ showEstimateBack = false }) {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-4xl">
      {showEstimateBack && (
        <BackButton onClick={() => router.push("/estimeaza")} className="mb-6">
          {t("form.back")}
        </BackButton>
      )}
      <LinkAnalyzer titleTag="h1" showFeaturePapers />
    </div>
  );
}

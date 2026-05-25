import FaqPage from "@/components/FaqPage";
import { getFaqItems } from "@/lib/faq-content";

export default function RoFaqPage() {
  return (
    <FaqPage
      title="Întrebări frecvente"
      subtitle="Răspunsuri rapide despre cum funcționează CatDai, cum sunt folosite datele și ce limite are serviciul."
      items={getFaqItems("ro")}
    />
  );
}

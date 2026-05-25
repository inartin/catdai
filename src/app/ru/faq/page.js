import FaqPage from "@/components/FaqPage";
import { getFaqItems } from "@/lib/faq-content";

export default function RuFaqPage() {
  return (
    <FaqPage
      title="Частые вопросы"
      subtitle="Короткие ответы о том, как работает CatDai, как используются данные и какие ограничения есть у сервиса."
      items={getFaqItems("ru")}
    />
  );
}

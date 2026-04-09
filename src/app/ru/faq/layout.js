import { serializeJsonLd, toAbsoluteUrl } from "@/lib/seo";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Что такое CatDai и какой результат вы получаете?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "CatDai — это информационный сервис рыночной аналитики, который дает ориентировочную оценку цены, а не официальную экспертизу.",
      },
    },
    {
      "@type": "Question",
      name: "На каких данных основан анализ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Анализ основан на публичных объявлениях, данных пользователя и рыночных сигналах, доступных на момент запроса.",
      },
    },
    {
      "@type": "Question",
      name: "CatDai аффилирован с 999.md, Makler.md или другие платформы?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Нет. CatDai не является аффилированным или официальным партнером этих платформ, если это явно не указано письменно.",
      },
    },
    {
      "@type": "Question",
      name: "Персональные данные продаются?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Нет. CatDai указывает, что не продает персональные данные пользователей.",
      },
    },
  ],
};

export const metadata = {
  title: "Частые вопросы | Catdai",
  description:
    "FAQ CatDai: как работают оценки, на каких данных строится анализ, как обрабатываются данные и какие есть ограничения сервиса.",
  alternates: {
    canonical: "/ru/faq",
    languages: {
      ro: "/ro/faq",
      ru: "/ru/faq",
      "x-default": "/ro/faq",
    },
  },
};

export default function RuFaqLayout({ children }) {
  const payload = {
    ...faqJsonLd,
    url: toAbsoluteUrl("/ru/faq"),
    inLanguage: "ru",
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

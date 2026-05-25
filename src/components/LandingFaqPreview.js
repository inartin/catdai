"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/icons/ArrowsIcons";
import { useTranslation } from "@/context/LanguageContext";
import { getLandingFaqItems } from "@/lib/faq-content";

export default function LandingFaqPreview() {
  const { lang, t } = useTranslation();
  const items = getLandingFaqItems(lang);
  const faqHref = lang === "ru" ? "/ru/faq" : "/ro/faq";

  return (
    <section className="px-4 pb-16">
      <div className="mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {t("landing.faqTitle")}
          </h2>
          <p className="mt-3 text-base leading-7 text-gray-600">
            {t("landing.faqSubtitle")}
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.question}
              className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
            >
              <h3 className="text-base font-bold leading-6 text-gray-900">
                {item.question}
              </h3>
              <div className="mt-3 space-y-3 text-sm leading-6 text-gray-600">
                {item.answers.map((answer) => (
                  <p key={answer}>{answer}</p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href={faqHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/15 transition-colors hover:bg-primary-dark"
          >
            {t("landing.faqCta")}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

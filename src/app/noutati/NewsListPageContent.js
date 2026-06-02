"use client";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { useTranslation } from "@/context/LanguageContext";

function fmtDate(value, lang) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(lang === "ru" ? "ru-RU" : "ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function NewsListPageContent({ newsPosts }) {
  const { lang, t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-950">
            {t("news.title")}
          </h1>
          <p className="mt-4 max-w-5xl text-base sm:text-lg text-gray-600">
            {t("news.subtitle")}
          </p>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {newsPosts.map((post) => (
              <Link
                key={post.id}
                href={`/noutati/${post.slug}`}
                className="group overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-colors hover:border-primary/30"
              >
                <div className="aspect-[16/10] bg-gray-100">
                  {post.cover_image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-400">
                      {t("news.fallbackImage")}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <p className="text-xs text-gray-400">{fmtDate(post.created_at, lang)}</p>
                  <h2 className="mt-2 text-lg font-bold leading-snug text-gray-950 group-hover:text-primary">
                    {post.title}
                  </h2>
                </div>
              </Link>
            ))}
          </div>

          {newsPosts.length === 0 && (
            <p className="mt-10 text-sm text-gray-500">{t("news.empty")}</p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

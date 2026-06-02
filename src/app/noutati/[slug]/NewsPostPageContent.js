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

export default function NewsPostPageContent({ post, latestNewsPosts, articleHtml, jsonLdHtml }) {
  const { lang, t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-20">
          <article className="min-w-0">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
            />

            <Link
              href="/noutati"
              className="group mb-6 flex items-center gap-1.5 text-gray-400 transition-colors hover:text-gray-700"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 transition-transform group-hover:-translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">{t("news.back")}</span>
            </Link>

            <p className="text-sm font-medium text-gray-500">{fmtDate(post.created_at, lang)}</p>
              <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {post.title}
            </h1>

            {post.cover_image_url && (
              <div className="mt-8 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.cover_image_url}
                  alt={post.title}
                  className="w-full object-cover"
                />
              </div>
            )}

            <div
              className="news-content mt-8 text-gray-700 sm:text-lg sm:leading-8"
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />
          </article>

          {latestNewsPosts.length > 0 && (
            <aside className="lg:pt-12">
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 p-6 sm:p-8">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-gray-900">{t("news.latestTitle")}</h2>
                    <span className="shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                      {latestNewsPosts.length}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">{t("news.latestSubtitle")}</p>

                  <div className="mt-5 space-y-3">
                    {latestNewsPosts.map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/noutati/${entry.slug}`}
                        className="group block rounded-xl border border-gray-100 p-3 transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        <p className="text-xs text-gray-400">{fmtDate(entry.created_at, lang)}</p>
                        <h3 className="mt-1 text-sm font-semibold leading-snug text-gray-900 group-hover:text-primary">
                          {entry.title}
                        </h3>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            </aside>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

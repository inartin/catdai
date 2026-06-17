"use client";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { supabase } from "@/lib/supabase";

function fmtDate(value, lang) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(lang === "ru" ? "ru-RU" : "ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function upvoteCount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export default function NewsPostPageContent({ post, latestNewsPosts, articleHtml, jsonLdHtml }) {
  const { lang, t } = useTranslation();
  const { session, loading: authLoading, clearAuthError } = useAuth();
  const [openImage, setOpenImage] = useState(null);
  const [count, setCount] = useState(() => upvoteCount(post.upvote_count));
  const [upvoted, setUpvoted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [upvoteMessage, setUpvoteMessage] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (!openImage) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") setOpenImage(null);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openImage]);

  useEffect(() => {
    setCount(upvoteCount(post.upvote_count));
    setUpvoted(false);
  }, [post.id, post.upvote_count]);

  useEffect(() => {
    if (authLoading || !session?.access_token) return;

    let cancelled = false;
    fetch(`/api/news/upvotes?post_id=${encodeURIComponent(post.id)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || cancelled) return;
        setCount(upvoteCount(payload.count));
        setUpvoted(!!payload.upvoted);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [authLoading, post.id, session?.access_token]);

  async function submitUpvote(accessToken) {
    const response = await fetch("/api/news/upvotes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ post_id: post.id, access_token: accessToken }),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }

  async function handleUpvote() {
    setUpvoteMessage("");

    const { data: freshSessionData } = await supabase.auth.getSession();
    const accessToken = freshSessionData?.session?.access_token || session?.access_token;

    if (!accessToken) {
      clearAuthError();
      setIsAuthModalOpen(true);
      return;
    }

    if (upvoted || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let { response, payload } = await submitUpvote(accessToken);

      if (!response.ok) {
        if (response.status === 401) {
          const { data: refreshedSessionData } = await supabase.auth.refreshSession();
          const refreshedAccessToken = refreshedSessionData?.session?.access_token;

          if (refreshedAccessToken) {
            ({ response, payload } = await submitUpvote(refreshedAccessToken));
          }

          if (response.status === 401) {
            setUpvoteMessage(t("news.upvoteFailed"));
            return;
          }
        }

        if (!response.ok) {
          setUpvoteMessage(payload?.error || t("news.upvoteFailed"));
          return;
        }
      }

      if (!response.ok) {
        setUpvoteMessage(payload?.error || t("news.upvoteFailed"));
        return;
      }

      setCount(upvoteCount(payload.count));
      setUpvoted(true);
    } catch {
      setUpvoteMessage(t("news.upvoteFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function openArticleImage(event) {
    const image = event.target.closest?.(".news-content img");
    if (!image) return;

    setOpenImage({
      src: image.currentSrc || image.src,
      alt: image.alt || post.title,
    });
  }

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

            <h1 className="text-2xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {post.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-gray-500">{fmtDate(post.created_at, lang)}</p>
              <button
                type="button"
                onClick={handleUpvote}
                disabled={isSubmitting || upvoted}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  upvoted
                    ? "cursor-default border-primary/20 bg-primary/10 text-primary"
                    : "cursor-pointer border-gray-200 bg-white text-gray-700 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                } disabled:opacity-80`}
                aria-pressed={upvoted}
                aria-label={upvoted ? t("news.upvoted") : t("news.upvote")}
              >
                <span aria-hidden="true" className="text-base leading-none">👍</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {count}
                </span>
              </button>
            </div>
            {upvoteMessage && (
              <p className="mt-2 text-sm font-medium text-amber-700">{upvoteMessage}</p>
            )}

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
              onClick={openArticleImage}
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
                        <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                          <p>{fmtDate(entry.created_at, lang)}</p>
                          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-gray-500">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M12 5v14M5 12l7-7 7 7" />
                            </svg>
                            {upvoteCount(entry.upvote_count)}
                          </span>
                        </div>
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
      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenImage(null)}
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setOpenImage(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-2xl leading-none text-white transition-colors hover:bg-white/20"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={openImage.src}
            alt={openImage.alt}
            className="max-h-[92vh] max-w-[96vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      <AuthRequiredModal
        open={isAuthModalOpen}
        showCopy={false}
        onClose={() => setIsAuthModalOpen(false)}
      />
      <Footer />
    </div>
  );
}

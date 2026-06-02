import NewsPostPageContent from "@/app/noutati/[slug]/NewsPostPageContent";
import { getNewsRequestLanguage } from "@/app/noutati/news-i18n";
import { getTextFromNewsHtml, sanitizeNewsHtml } from "@/lib/news-content";
import { fetchPublishedNewsPostBySlug, fetchPublishedNewsPosts } from "@/lib/news-posts";
import { serializeJsonLd, toAbsoluteUrl } from "@/lib/seo";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [lang, post] = await Promise.all([
    getNewsRequestLanguage(),
    fetchPublishedNewsPostBySlug(slug),
  ]);

  if (!post) {
    return {
      title: `${lang === "ru" ? "Новость недоступна" : "Noutate indisponibilă"} | CatDai`,
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const path = `/noutati/${post.slug}`;
  const description = getTextFromNewsHtml(post.description).slice(0, 160);

  return {
    title: `${post.title} | CatDai`,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: post.title,
      description,
      url: path,
      siteName: "CatDai",
      type: "article",
      locale: lang === "ru" ? "ru_MD" : "ro_MD",
      publishedTime: post.created_at,
      images: post.cover_image_url ? [{ url: post.cover_image_url }] : undefined,
    },
    twitter: {
      card: post.cover_image_url ? "summary_large_image" : "summary",
      title: post.title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function NewsPostPage({ params }) {
  const { slug } = await params;
  const [post, allNewsPosts] = await Promise.all([
    fetchPublishedNewsPostBySlug(slug),
    fetchPublishedNewsPosts(),
  ]);

  if (!post) notFound();

  const latestNewsPosts = allNewsPosts
    .filter((entry) => entry.slug !== post.slug)
    .slice(0, 5);
  const postUrl = toAbsoluteUrl(`/noutati/${post.slug}`);
  const articleHtml = sanitizeNewsHtml(post.description);
  const articleText = getTextFromNewsHtml(articleHtml);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title,
    description: articleText,
    datePublished: post.created_at,
    dateModified: post.created_at,
    mainEntityOfPage: postUrl,
    url: postUrl,
    publisher: {
      "@type": "Organization",
      name: "CatDai",
      url: toAbsoluteUrl("/"),
    },
    image: post.cover_image_url ? [post.cover_image_url] : undefined,
  };

  return (
    <NewsPostPageContent
      post={post}
      latestNewsPosts={latestNewsPosts}
      articleHtml={articleHtml}
      jsonLdHtml={serializeJsonLd(jsonLd)}
    />
  );
}

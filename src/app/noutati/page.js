import NewsListPageContent from "@/app/noutati/NewsListPageContent";
import { getNewsRequestLanguage, translations } from "@/app/noutati/news-i18n";
import { fetchPublishedNewsPosts } from "@/lib/news-posts";

const canonicalPath = "/noutati";

export async function generateMetadata() {
  const lang = await getNewsRequestLanguage();
  const title = translations[lang]["news.title"];
  const description = translations[lang]["news.subtitle"];

  return {
    title: `${title} | CatDai`,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      siteName: "CatDai",
      type: "website",
      locale: lang === "ru" ? "ru_MD" : "ro_MD",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export const dynamic = "force-dynamic";

export default async function NoutatiPage() {
  const newsPosts = await fetchPublishedNewsPosts();

  return <NewsListPageContent newsPosts={newsPosts} />;
}

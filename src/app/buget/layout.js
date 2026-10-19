import { cookies } from "next/headers";

export async function generateMetadata() {
  const lang = (await cookies()).get("catdai-lang")?.value;
  return {
    title: lang === "ru" ? "Бюджет на жильё | Catdai" : "Buget pentru locuință | Catdai",
    description: lang === "ru"
      ? "Наглядный пример бюджета покупки жилья и ипотечных сценариев."
      : "O imagine clară a bugetului pentru locuință și a scenariilor cu credit ipotecar.",
    robots: { index: false, follow: false },
  };
}

export default function BugetLayout({ children }) {
  return children;
}

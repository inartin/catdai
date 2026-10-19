"use client";

import { useEffect } from "react";
import ListingSeoSections from "@/app/verifica-anunt/ListingSeoSections";
import { listingPageCopy } from "@/app/verifica-anunt/content";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import LinkAnalyzer from "@/components/LinkAnalyzer";
import { useTranslation } from "@/context/LanguageContext";
import styles from "@/app/verifica-anunt/page.module.css";

export default function ListingAnalyzerPageContent({ showEstimateBack = false }) {
  const router = useRouter();
  const { t, lang } = useTranslation();
  const copy = listingPageCopy[lang];

  useEffect(() => {
    document.title = copy.title;
  }, [copy.title]);

  // Keep the navbar language choice on the matching indexable URL.
  useEffect(() => {
    const urlLang = window.location.pathname.startsWith("/ru/") ? "ru" : "ro";
    if (lang === urlLang) return;
    const path = lang === "ru" ? "/ru/verifica-anunt" : "/verifica-anunt";
    window.location.assign(`${path}${window.location.search}${window.location.hash}`);
  }, [lang]);

  return (
    <div lang={lang}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            {showEstimateBack && (
              <BackButton onClick={() => router.push("/estimeaza")} className="mb-7 !text-emerald-100 hover:!text-white">
                {t("form.back")}
              </BackButton>
            )}
            <span className={styles.eyebrow}><span className={styles.eyebrowDot} />{copy.eyebrow}</span>
            <h1>{copy.heading}</h1>
            <p>{copy.intro}</p>
            <span className={styles.heroBadge}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /></svg>
              {copy.heroBadge}
            </span>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <div className={styles.artOrbit} />
            <div className={styles.artCard}>
              <div className={styles.artCardTop}><span className={styles.artLogo}>999.md</span><span>{copy.heroExample}</span></div>
              <div className={styles.artBuilding}><span /><span /><span /><span /><span /><span /></div>
              <div className={styles.artProperty}>2 {lang === "ru" ? "комнаты" : "camere"} · 60 m² · Chișinău</div>
              <div className={styles.artPriceLine}><span>{copy.heroPrice}</span><strong>99 000 €</strong></div>
              <div className={styles.artPriceLine}><span>{copy.heroEstimate}</span><strong>90 000 €</strong></div>
              <div className={styles.artBars}><span /><span /></div>
            </div>
            <div className={styles.artCallout}><span>↗</span>{copy.heroDifference}</div>
          </div>
        </div>
      </section>
      <div className={styles.topContent}>
        <div className={styles.steps} aria-label={lang === "ru" ? "Этапы" : "Pași"}>
          {copy.steps.map((step, index) => <div key={step} className={styles.step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</div>)}
        </div>
        <div id="verifica-link" className="mx-auto max-w-3xl scroll-mt-24">
          <LinkAnalyzer showFeaturePapers prominent className="mt-0" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-5">
        <ListingSeoSections copy={copy} />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import CadastruLoadingIcon from "@/components/CadastruLoadingIcon";
import { ArrowRight } from "@/components/icons/ArrowsIcons";
import { useTranslation } from "@/context/LanguageContext";
import styles from "./LandingCadastruCard.module.css";

export default function LandingCadastruCard() {
  const { t, lang } = useTranslation();

  return (
    <section className={`${styles.section} relative isolate mb-8 px-4 py-8 sm:py-12`} aria-labelledby="landing-cadastru-title">
      <div className="relative mx-auto max-w-4xl">
        <div className="grid sm:grid-cols-[1fr_220px] md:grid-cols-[1fr_280px]">
          <div className="relative z-10 px-5 pb-6 pt-6 sm:p-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-800">{t("landing.cadastruEyebrow")}</p>
            <h2 id="landing-cadastru-title" className="mt-3 max-w-md pr-20 text-2xl font-extrabold leading-tight tracking-tight text-emerald-950 sm:pr-0 md:text-3xl">
              {t("landing.cadastruTitle").split("\n").map((line) => (
                <span key={line} className="block text-balance">{line}</span>
              ))}
            </h2>
            <p className="mt-3 max-w-md pr-12 text-sm leading-6 text-slate-600 sm:pr-0">{t("landing.cadastruDescription")}</p>
            <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-emerald-900">
              {["Property", "Map", "Nearby"].map((feature) => (
                <li key={feature} className="flex items-center gap-1.5">
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 8 3 3 7-7" /></svg>
                  {t(`landing.cadastru${feature}`)}
                </li>
              ))}
            </ul>
            <Link href={`/${lang}/cadastru`} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 sm:w-auto">
              {t("landing.cadastruCta")}
              <ArrowRight size={16} />
            </Link>
            <p className="mt-2.5 text-center text-xs text-slate-500 sm:text-left">{t("landing.cadastruSearchHint")}</p>
          </div>
          <div aria-hidden="true" className={`${styles.atlas} pointer-events-none absolute right-3 top-9 flex h-28 w-20 items-center justify-center sm:relative sm:right-auto sm:top-auto sm:h-auto sm:w-auto`}>
            <span className="absolute left-5 top-5 hidden font-mono text-[9px] tracking-[0.18em] text-emerald-800/60 sm:block">MD / CADASTRU</span>
            <div className={`${styles.map} relative h-28 aspect-[143/178] text-emerald-700 sm:h-52`}>
              <svg viewBox="3 3 143 178" className="absolute inset-0 h-full w-full" fill="none">
                {/* Place the illustrative property beneath the existing location beacon. */}
                <g transform="translate(13 27)">
                <path d="M58 42 90 45 101 66 75 82 59 66Z" fill="#eef3e8" fillOpacity="0.95" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2" strokeLinejoin="round" />
                <path d="m69 52 15-1 5 12-8 3 2 6-10 3Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                {[[58, 42], [90, 45], [101, 66], [75, 82], [59, 66]].map(([x, y]) => (
                  <rect key={`${x}-${y}`} x={x - 1.8} y={y - 1.8} width="3.6" height="3.6" fill="#eef3e8" stroke="currentColor" strokeWidth="1.2" />
                ))}
                </g>
              </svg>
              <CadastruLoadingIcon className="relative h-full w-full" />
            </div>
            <span className="absolute bottom-5 left-5 right-5 hidden items-center gap-2 text-[10px] font-mono font-semibold tracking-wide text-emerald-900/70 sm:flex"><span className="h-px flex-1 bg-emerald-900/20" />{t("landing.cadastruNumberExample")}<span className="h-px flex-1 bg-emerald-900/20" /></span>
          </div>
        </div>
      </div>
    </section>
  );
}

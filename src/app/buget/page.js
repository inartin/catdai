"use client";

import { useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTranslation } from "@/context/LanguageContext";
import styles from "./page.module.css";

const BANKS = [
  { name: "maib", rate: 7.9, color: "#169c88" },
  { name: "Victoriabank", rate: 8.2, color: "#ec6e57" },
  { name: "Moldindconbank", rate: 8.5, color: "#7690d4" },
];

const HOMES = [
  { price: 58000, rooms: 1, size: 38, shape: "studio" },
  { price: 92000, rooms: 2, size: 62, shape: "balanced" },
  { price: 119000, rooms: 3, size: 80, shape: "family" },
];

const copy = {
  ro: {
    eyebrow: "SPAȚIUL TĂU DE DECIZIE",
    heroTitle: "Câtă locuință îți permite bugetul?",
    heroText: "Pornește de la banii pe care îi ai și vezi, dintr-o privire, ce opțiuni ai cu sau fără credit.",
    demo: "Previzualizare cu date demonstrative",
    heroMetric: "Un plan clar, înainte de căutare",
    heroMetricSmall: "Buget · credit · opțiuni",
    step1: "Alege bugetul",
    step2: "Vezi plafonul",
    step3: "Compară opțiuni",
    planner: "Construiește-ți scenariul",
    plannerSub: "Ajustează cifrele pentru a vedea cum se schimbă imaginea de ansamblu.",
    cash: "Doar economii",
    credit: "Cu credit",
    savings: "Economii disponibile",
    savingsHint: "Suma pe care ai pune-o în achiziție",
    monthly: "Rată lunară confortabilă",
    monthlyHint: "Alege o sumă pe care ai putea-o susține lunar",
    years: "Perioada creditului",
    yearsSuffix: "ani",
    scenarioNote: "Estimare simplificată. Nu include taxe, asigurări sau costuri de tranzacție.",
    resultEyebrow: "PLAFON ORIENTATIV",
    resultTitleCash: "Bugetul tău de cumpărare",
    resultTitleCredit: "Ai putea explora locuințe până la",
    available: "disponibili pentru cumpărare",
    ownMoney: "Banii tăi",
    loan: "Credit estimat",
    monthlyLabel: "rată lunară aleasă",
    selectedRate: "dobândă exemplu",
    overview: "Cum se compune bugetul",
    overviewCash: "Fără credit, întregul buget vine din economiile tale.",
    optionsEyebrow: "PUNCTE DE PORNIRE",
    optionsTitle: "Trei direcții pe care le poți explora",
    optionsSub: "Exemple de tipuri de locuințe, ca să vezi ce se poate încadra în scenariul tău.",
    rooms: "camere",
    room: "cameră",
    example: "Exemplu de preț",
    within: "În buget",
    above: "Peste buget",
    roomToSpare: "Marjă rămasă",
    shortBy: "Diferență de acoperit",
    home1: "Compact și eficient",
    home2: "Spațiu echilibrat",
    home3: "Mai mult loc pentru viitor",
    bankEyebrow: "COMPARĂ SCENARII",
    bankTitle: "Cum se schimbă plafonul în funcție de bancă",
    bankSub: "Alege o rată demonstrativă și vezi efectul asupra bugetului tău.",
    choose: "Alege scenariul",
    selected: "Selectat",
    exampleRate: "Dobândă exemplu",
    maxBudget: "Buget posibil",
    bankNote: "Numele băncilor sunt folosite doar pentru machetă. Procentele sunt inventate, nu reprezintă oferte sau rate actuale. Condițiile reale pot varia.",
    insightTitle: "Un reper bun pentru următorul pas",
    insightText: "Acum vezi ce prețuri se potrivesc scenariului tău. Când vom conecta date reale, aici vei putea compara piața și ofertele bancare actualizate.",
    insightTag: "Imagine de ansamblu, fără surprize",
    footerNote: "Toate prețurile, dobânzile și locuințele de pe această pagină sunt exemple pentru interfață.",
  },
  ru: {
    eyebrow: "ПРОСТРАНСТВО ДЛЯ РЕШЕНИЯ",
    heroTitle: "Какое жильё позволяет ваш бюджет?",
    heroText: "Начните со своих сбережений и сразу увидите варианты с кредитом или без него.",
    demo: "Предпросмотр с демонстрационными данными",
    heroMetric: "Понятный план до начала поиска",
    heroMetricSmall: "Бюджет · кредит · варианты",
    step1: "Укажите бюджет",
    step2: "Узнайте предел",
    step3: "Сравните варианты",
    planner: "Соберите свой сценарий",
    plannerSub: "Изменяйте суммы и смотрите, как меняется общая картина.",
    cash: "Только сбережения",
    credit: "С кредитом",
    savings: "Доступные сбережения",
    savingsHint: "Сумма, которую вы готовы вложить в покупку",
    monthly: "Комфортный платёж в месяц",
    monthlyHint: "Выберите сумму, которую сможете вносить ежемесячно",
    years: "Срок кредита",
    yearsSuffix: "лет",
    scenarioNote: "Упрощённый расчёт. Налоги, страховка и расходы на сделку не включены.",
    resultEyebrow: "ПРИМЕРНЫЙ ПРЕДЕЛ",
    resultTitleCash: "Ваш бюджет на покупку",
    resultTitleCredit: "Можно рассмотреть жильё стоимостью до",
    available: "доступно для покупки",
    ownMoney: "Ваши деньги",
    loan: "Примерный кредит",
    monthlyLabel: "выбранный платёж",
    selectedRate: "примерная ставка",
    overview: "Из чего складывается бюджет",
    overviewCash: "Без кредита весь бюджет состоит из ваших сбережений.",
    optionsEyebrow: "С ЧЕГО НАЧАТЬ",
    optionsTitle: "Три направления для поиска",
    optionsSub: "Примеры жилья, чтобы оценить, что подходит под ваш сценарий.",
    rooms: "комнаты",
    room: "комната",
    example: "Пример цены",
    within: "В бюджете",
    above: "Выше бюджета",
    roomToSpare: "Остаётся",
    shortBy: "Не хватает",
    home1: "Компактно и практично",
    home2: "Баланс пространства",
    home3: "Больше места на будущее",
    bankEyebrow: "СРАВНИТЕ СЦЕНАРИИ",
    bankTitle: "Как банк влияет на ваш предел",
    bankSub: "Выберите демонстрационную ставку и посмотрите, как меняется бюджет.",
    choose: "Выбрать сценарий",
    selected: "Выбрано",
    exampleRate: "Пример ставки",
    maxBudget: "Возможный бюджет",
    bankNote: "Названия банков используются только в макете. Проценты вымышлены и не являются актуальными ставками или предложениями. Реальные условия могут отличаться.",
    insightTitle: "Ориентир для следующего шага",
    insightText: "Теперь вы видите, какие цены подходят вашему сценарию. Когда здесь появятся реальные данные, вы сможете сравнить рынок и актуальные предложения банков.",
    insightTag: "Общая картина без сложностей",
    footerNote: "Все цены, ставки и варианты жилья на этой странице приведены только для демонстрации интерфейса.",
  },
};

function formatMoney(value, lang) {
  return `${new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "ro-RO", { maximumFractionDigits: 0 }).format(value)} €`;
}

function loanFromPayment(payment, rate, years) {
  const monthlyRate = rate / 1200;
  const months = years * 12;
  return Math.round(payment * (1 - (1 + monthlyRate) ** -months) / monthlyRate);
}

function Icon({ name, size = 20 }) {
  const paths = {
    wallet: <><path d="M4 7.5V6a2 2 0 0 1 2-2h12" /><rect x="3" y="7" width="18" height="13" rx="3" /><path d="M16 13h5" /><circle cx="16" cy="13.5" r=".7" fill="currentColor" stroke="none" /></>,
    spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" /><path d="m19 18 .6 1.4L21 20l-1.4.6L19 22l-.6-1.4L17 20l1.4-.6L19 18Z" /></>,
    arrow: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
    house: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z" /><path d="M9 21v-7h6v7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function HouseGraphic({ variant }) {
  return (
    <div className={`${styles.houseGraphic} ${styles[variant]}`} aria-hidden="true">
      <div className={styles.graphicSun} />
      <div className={styles.graphicFloor} />
      <div className={styles.graphicBuilding}>
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className={styles.graphicShrub} />
    </div>
  );
}

export default function BugetPage() {
  const { lang } = useTranslation();
  const c = copy[lang] || copy.ro;
  const [mode, setMode] = useState("credit");
  const [savings, setSavings] = useState(35000);
  const [monthly, setMonthly] = useState(600);
  const [years, setYears] = useState(25);
  const [bankIndex, setBankIndex] = useState(0);
  const activeBank = BANKS[bankIndex];
  const estimatedLoan = useMemo(() => mode === "credit" ? loanFromPayment(monthly, activeBank.rate, years) : 0, [mode, monthly, activeBank.rate, years]);
  const buyingBudget = savings + estimatedLoan;
  const savingsShare = Math.min(100, Math.round(savings / buyingBudget * 100));

  return (
    <div className={styles.page}>
      <Navbar />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}><span className={styles.eyebrowDot} />{c.eyebrow}</span>
              <h1>{c.heroTitle}</h1>
              <p>{c.heroText}</p>
              <span className={styles.demoBadge}><Icon name="spark" size={15} />{c.demo}</span>
            </div>
            <div className={styles.heroArt} aria-hidden="true">
              <div className={styles.heroArtOrbit} />
              <div className={styles.heroArtCard}>
                <div className={styles.heroArtRoof} />
                <div className={styles.heroArtWindows}><span /><span /><span /><span /></div>
                <div className={styles.heroArtDoor} />
              </div>
              <div className={styles.heroArtMini}><span className={styles.heroArtMiniIcon}><Icon name="check" size={18} /></span><span><strong>{c.heroMetric}</strong><small>{c.heroMetricSmall}</small></span></div>
            </div>
          </div>
        </section>

        <div className={styles.content}>
          <div className={styles.steps} aria-label={lang === "ru" ? "Шаги" : "Pași"}>
            {[c.step1, c.step2, c.step3].map((step, index) => <div key={step} className={styles.step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</div>)}
          </div>

          <section className={styles.plannerGrid} aria-labelledby="planner-title">
            <div className={styles.plannerCard}>
              <div className={styles.cardHeading}><span className={styles.cardIcon}><Icon name="wallet" /></span><div><h2 id="planner-title">{c.planner}</h2><p>{c.plannerSub}</p></div></div>
              <div className={styles.modeTabs} role="group" aria-label={c.planner}>
                <button type="button" aria-pressed={mode === "cash"} className={mode === "cash" ? styles.activeTab : ""} onClick={() => setMode("cash")}>{c.cash}</button>
                <button type="button" aria-pressed={mode === "credit"} className={mode === "credit" ? styles.activeTab : ""} onClick={() => setMode("credit")}>{c.credit}</button>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldTop}><label htmlFor="budget-savings">{c.savings}</label><strong>{formatMoney(savings, lang)}</strong></div>
                <input id="budget-savings" type="range" min="5000" max="120000" step="1000" value={savings} onChange={(event) => setSavings(Number(event.target.value))} style={{ "--range-progress": `${(savings - 5000) / 115000 * 100}%` }} />
                <div className={styles.rangeEnds}><span>5 000 €</span><span>120 000 €</span></div>
                <p>{c.savingsHint}</p>
              </div>
              {mode === "credit" && <>
                <div className={styles.field}>
                  <div className={styles.fieldTop}><label htmlFor="budget-monthly">{c.monthly}</label><strong>{formatMoney(monthly, lang)}</strong></div>
                  <input id="budget-monthly" type="range" min="200" max="1800" step="25" value={monthly} onChange={(event) => setMonthly(Number(event.target.value))} style={{ "--range-progress": `${(monthly - 200) / 1600 * 100}%` }} />
                  <div className={styles.rangeEnds}><span>200 €</span><span>1 800 €</span></div>
                  <p>{c.monthlyHint}</p>
                </div>
                <div className={styles.termField}><label htmlFor="budget-years">{c.years}</label><select id="budget-years" value={years} onChange={(event) => setYears(Number(event.target.value))}>{[15, 20, 25, 30].map((value) => <option key={value} value={value}>{value} {c.yearsSuffix}</option>)}</select></div>
              </>}
              <p className={styles.calculationNote}><span>i</span>{c.scenarioNote}</p>
            </div>

            <div className={styles.resultCard} aria-live="polite">
              <div className={styles.resultCardTop}><span>{c.resultEyebrow}</span><span className={styles.resultSpark}><Icon name="spark" size={19} /></span></div>
              <h2>{mode === "cash" ? c.resultTitleCash : c.resultTitleCredit}</h2>
              <div className={styles.budgetFigure}>{formatMoney(buyingBudget, lang)}</div>
              <p className={styles.budgetCaption}>{c.available}</p>
              <div className={styles.budgetVisual}>
                <div className={styles.donut} style={{ "--savings-share": `${savingsShare}%` }}><div><Icon name="house" size={29} /></div></div>
                <div className={styles.budgetLegend}>
                  <h3>{c.overview}</h3>
                  <div><span className={styles.legendDotCash} />{c.ownMoney}<strong>{formatMoney(savings, lang)}</strong></div>
                  {mode === "credit" ? <div><span className={styles.legendDotLoan} />{c.loan}<strong>{formatMoney(estimatedLoan, lang)}</strong></div> : <p>{c.overviewCash}</p>}
                </div>
              </div>
              {mode === "credit" && <div className={styles.resultFoot}><span><strong>{formatMoney(monthly, lang)}</strong>{c.monthlyLabel}</span><span><strong>{activeBank.rate.toFixed(1)}%</strong>{c.selectedRate}</span></div>}
            </div>
          </section>

          <section className={styles.optionsSection} aria-labelledby="options-title">
            <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>{c.optionsEyebrow}</span><h2 id="options-title">{c.optionsTitle}</h2><p>{c.optionsSub}</p></div><span className={styles.sectionDecoration}><Icon name="arrow" size={22} /></span></div>
            <div className={styles.homeGrid}>
              {HOMES.map((home, index) => {
                const difference = buyingBudget - home.price;
                return <article className={styles.homeCard} key={home.shape}>
                  <HouseGraphic variant={home.shape} />
                  <div className={styles.homeBody}>
                    <div className={styles.homeMeta}><span>{home.rooms} {home.rooms === 1 ? c.room : c.rooms}</span><span>{home.size} m²</span></div>
                    <h3>{c[`home${index + 1}`]}</h3>
                    <span className={styles.priceLabel}>{c.example}</span>
                    <div className={styles.homePriceRow}><strong>{formatMoney(home.price, lang)}</strong><span className={difference >= 0 ? styles.fitBadge : styles.overBadge}>{difference >= 0 ? c.within : c.above}</span></div>
                    <div className={styles.homeProgress}><span style={{ width: `${Math.min(100, Math.round(buyingBudget / home.price * 100))}%` }} /></div>
                    <p className={styles.homeDifference}>{difference >= 0 ? c.roomToSpare : c.shortBy}: <strong>{formatMoney(Math.abs(difference), lang)}</strong></p>
                  </div>
                </article>;
              })}
            </div>
          </section>

          {mode === "credit" && <section className={styles.bankSection} aria-labelledby="banks-title">
            <div className={styles.sectionHeading}><div><span className={styles.sectionEyebrow}>{c.bankEyebrow}</span><h2 id="banks-title">{c.bankTitle}</h2><p>{c.bankSub}</p></div></div>
            <div className={styles.bankGrid}>
              {BANKS.map((bank, index) => {
                const selected = index === bankIndex;
                return <button key={bank.name} type="button" aria-pressed={selected} className={`${styles.bankCard} ${selected ? styles.bankSelected : ""}`} onClick={() => setBankIndex(index)}>
                  <span className={styles.bankTop}><span className={styles.bankAvatar} style={{ "--bank-color": bank.color }}>{bank.name.slice(0, 1).toUpperCase()}</span><span className={styles.bankName}>{bank.name}</span><span className={styles.bankRadio}>{selected && <Icon name="check" size={13} />}</span></span>
                  <span className={styles.bankDetails}><span><small>{c.exampleRate}</small><strong>{bank.rate.toFixed(1)}%</strong></span><span><small>{c.maxBudget}</small><strong>{formatMoney(savings + loanFromPayment(monthly, bank.rate, years), lang)}</strong></span></span>
                  <span className={styles.bankAction}>{selected ? c.selected : c.choose}<Icon name="arrow" size={16} /></span>
                </button>;
              })}
            </div>
            <p className={styles.bankNote}>{c.bankNote}</p>
          </section>}

          <section className={styles.insight}><div className={styles.insightIcon}><Icon name="spark" size={25} /></div><div><span>{c.insightTag}</span><h2>{c.insightTitle}</h2><p>{c.insightText}</p></div><div className={styles.insightLines} aria-hidden="true"><span /><span /><span /></div></section>
          <p className={styles.finalNote}>{c.footerNote}</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

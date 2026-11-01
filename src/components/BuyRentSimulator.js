'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useTranslation } from '@/context/LanguageContext';
import { buyRentCopy } from '@/lib/buy-rent-copy';
import { BUY_RENT_DEFAULTS, BUY_RENT_LIMITS, BUY_RENT_STORAGE_KEY, simulateBuyRent, affordableHome } from '@/lib/buy-rent';
import styles from '@/app/cumparare-sau-chirie/page.module.css';

function Field({ name, values, onChange, c, unit = '€', source, mode }) {
  const [min, max] = BUY_RENT_LIMITS[name];
  const value = values[name];
  const invalid = value === '' || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max
    || (name === 'down' && mode === 'compare' && Number(value) > Number(values.price))
    || (name === 'repairCash' && Number(value) > Number(values.repairCost))
    || (['term', 'repairTerm', 'moveMonths'].includes(name) && !Number.isInteger(Number(value)));
  return <div className={styles.field}>
    <label htmlFor={`br-${name}`}>{c[name]}</label>
    <div className={styles.inputWrap}>
      <input id={`br-${name}`} type="number" inputMode="decimal" min={min} max={name === 'repairCash' ? Math.min(max, Number(values.repairCost)) : max} step={['term', 'repairTerm', 'moveMonths'].includes(name) ? 1 : 'any'} value={value} onChange={(e) => onChange(name, e.target.value)} aria-invalid={invalid} aria-describedby={invalid ? 'br-validation' : undefined} />
      <span>{unit}</span>
    </div>
    <div>
    {invalid && <small>{min.toLocaleString()} - {max.toLocaleString()}</small>}
    {source?.kind === 'market' && <small className={styles.verified}>{c.market}</small>}
    </div>
  </div>;
}

function HomeIcon({ rented = false }) {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 22 18-15 18 15M11 19v22h26V19M20 41V28h8v13" />
    {rented ? <path d="M19 20h10" /> : <path d="m19 20 3 3 7-7" />}
  </svg>;
}

function PaymentBars({ result, values, repair, buyLabel, c, money, fill }) {
  const purchasePrincipal = (repair ? Number(values.repairCash) : Number(values.down)) + result.principal;
  const maximum = Math.max(1, result.buySpent, result.rentSpent);
  const groups = [
    { label: buyLabel, total: result.buySpent, segments: [
      { label: repair ? c.repairPaid : c.homePaid, value: purchasePrincipal, color: '#34765a' },
      { label: c.interestShort, value: result.interest, color: '#c3974e' },
      { label: c.otherCostsShort, value: Math.max(0, result.buySpent - purchasePrincipal - result.interest), color: '#a6b6a4' },
    ] },
    { label: c.ifRent, total: result.rentSpent, segments: [
      { label: c.rentShort, value: result.rentOnly, color: '#7489c4' },
      { label: c.otherCostsShort, value: Math.max(0, result.rentSpent - result.rentOnly), color: '#bec9e6' },
    ] },
  ];
  return <div className={styles.paymentBars}>
    {groups.map((group) => <div key={group.label} className={styles.paymentRow}>
      <div className={styles.barHeading}><h3>{group.label}</h3><strong>{money(group.total)}</strong></div>
      <div className={styles.barTrack} aria-hidden="true">
        {group.segments.map((segment) => <span key={segment.label} style={{ width: `${segment.value / maximum * 100}%`, backgroundColor: segment.color }} />)}
      </div>
      <dl className={styles.barLegend}>{group.segments.filter((segment) => segment.value > 0.005).map((segment) => <div key={segment.label}><dt><i style={{ backgroundColor: segment.color }} aria-hidden="true" />{segment.label}</dt><dd>{money(segment.value)}</dd></div>)}</dl>
    </div>)}
    <p className={styles.paymentDifference}>{Math.abs(result.buySpent - result.rentSpent) < 1 ? c.sameTotal : fill(c.totalDifference, { amount: money(Math.abs(result.buySpent - result.rentSpent)) })}</p>
    {!repair && <p className={styles.barNote}>{c.barNote}</p>}
  </div>;
}

export default function BuyRentSimulator() {
  const { lang } = useTranslation();
  const c = buyRentCopy[lang] || buyRentCopy.ro;
  const [values, setValues] = useState(BUY_RENT_DEFAULTS);
  const [sources, setSources] = useState({});
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('compare');
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(BUY_RENT_STORAGE_KEY));
      if (saved?.values && typeof saved.values === 'object') {
        setValues(Object.fromEntries(Object.entries(BUY_RENT_DEFAULTS).map(([key, fallback]) => [key, typeof saved.values[key] === 'number' || typeof saved.values[key] === 'string' ? saved.values[key] : fallback])));
        setSources(saved.sources || {});
        if (['compare', 'afford', 'repair'].includes(saved.mode)) setMode(saved.mode);
      }
    } catch { /* The simulator also works without browser storage. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { sessionStorage.setItem(BUY_RENT_STORAGE_KEY, JSON.stringify({ values, sources, lang, mode })); } catch { /* Optional persistence. */ }
  }, [values, sources, lang, ready, mode]);
  const update = (name, value) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    if (name === 'price' || name === 'rent') setSources((previous) => ({ ...previous, [name]: { kind: 'manual' } }));
  };
  const result = useMemo(() => simulateBuyRent(values, mode), [values, mode]);
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-GB' : 'ro-MD';
  const money = (value, compact = false) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}) }).format(value);
  const unit = (name) => ['rate', 'repairRate', 'inflation', 'rentGrowth'].includes(name) ? c.annual : ['term', 'repairTerm'].includes(name) ? c.yearsUnit : name === 'moveMonths' ? c.monthsUnit : name === 'maintenance' ? c.yearly : ['rent', 'ownerExtra', 'renterExtra'].includes(name) ? c.monthly : '€';
  const field = (name) => <Field key={name} name={name} values={values} onChange={update} c={c} unit={unit(name)} source={sources[name]} mode={mode} />;
  const fill = (text, params) => Object.entries(params).reduce((value, [key, item]) => value.replaceAll(`{${key}}`, item), text);
  const number = (value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const repair = mode === 'repair';
  const buyLabel = repair ? c.ifRepair : c.ifBuy;
  const mainFields = repair ? ['rent', 'repairCost', 'repairCash', 'repairRate', 'repairTerm', 'moveMonths'] : mode === 'afford' ? ['rent', 'down', 'rate', 'term'] : ['price', 'rent', 'down', 'rate', 'term'];
  const extraFields = repair ? ['maintenance', 'ownerExtra', 'renterExtra'] : mode === 'afford' ? ['maintenance', 'ownerExtra', 'renterExtra', 'purchaseFees', 'renovation'] : ['maintenance', 'ownerExtra', 'renterExtra', 'purchaseFees', 'renovation', 'rentSetup'];
  const line = (label, value) => <div><dt>{label}</dt><dd>{money(value)}</dd></div>;
  const estimatorHref = (type) => {
    const input = (type === 'rent' ? sources.price : sources.rent)?.input;
    const params = new URLSearchParams({ type });
    if (input) {
      for (const [target, key] of [['city', 'city'], ['district', 'district'], ['rooms', 'rooms_count'], ['area', 'area_m2'], ['building_type', 'building_type'], ['renovation', 'renovation']]) {
        if (input[key]) params.set(target, String(input[key]));
      }
      if (!params.has('district') && Array.isArray(input.districts)) input.districts.forEach((value) => params.append('district', value));
      if (!params.has('building_type') && Array.isArray(input.building_types)) input.building_types.forEach((value) => params.append('building_type', value));
    }
    return `/${lang === 'en' ? 'ro' : lang}/estimeaza?${params}`;
  };
  const date = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString(locale, { timeZone: 'Europe/Chisinau' }) : null;
  return <><Navbar /><main className={styles.page}>
    <header className={styles.hero}><h1>{c.title}</h1><p className={styles.intro}>{c.simpleIntro}</p></header>
    <section className={styles.chooser} aria-label={c.choose}>
      <h2>{c.choose}</h2><div className={styles.scenarioButtons}>{['compare', 'afford'].map((item) => <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{c[item]}</button>)}</div>
      <button type="button" className={styles.repairButton} aria-pressed={repair} onClick={() => setMode('repair')}>{c.repair} →</button>
    </section>
    <div className={styles.workspace}>
      <div className={styles.controls}>
        <section className={styles.card}>
          <h2 className={styles.inputHeading}>{c.inputs}</h2>{repair && <p className={styles.example}>{c.repairIntro}</p>}
          <div className={styles.fields}>{mainFields.map(field)}</div>
          {mode !== 'afford' && <><div className={styles.horizon}><label htmlFor="br-years">{c.horizon}</label><strong>{values.years} <small>{c.yearsUnit}</small></strong></div><input id="br-years" className={styles.range} type="range" min="5" max="30" step="1" value={values.years} onChange={(e) => update('years', e.target.value)} /><div className={styles.rangeEnds}><span>5 {c.yearsUnit}</span><span>30 {c.yearsUnit}</span></div></>}
          {!repair && <details className={styles.estimatePanel}><summary>{c.simpleEstimate}</summary><div className={styles.estimateLinks}>{mode === 'compare' && <Link href={estimatorHref('sale')}>{c.saleEstimate} ↗</Link>}<Link href={estimatorHref('rent')}>{c.rentEstimate} ↗</Link></div><p>{c.estimateNote}</p></details>}
        </section>
        <details className={`${styles.card} ${styles.advanced}`}><summary>{c.advanced}<span aria-hidden="true">+</span></summary>
          <div className={styles.extraFields}><div className={styles.fields}>{extraFields.map(field)}</div></div><p className={styles.hint}>{c.costsNote}</p>
          {mode !== 'afford' && <><h3>{c.future}</h3><div className={styles.fields}>{['inflation', 'rentGrowth'].map(field)}</div><p className={styles.hint}>{c.growthNote}</p></>}
          <p className={styles.hint}>{c.rateHint}</p>{repair && <p className={styles.hint}>{c.repairNote}</p>}
        </details>
        <details className={`${styles.card} ${styles.sourceDetails}`}><summary>{c.simpleData}</summary><p>{c.dataText}</p>
          {['price', 'rent'].map((key) => sources[key]?.kind === 'market' && <div className={styles.provenance} key={key}><strong>{c[key]} · {money(Number(values[key]))}</strong>
            {sources[key].input?.city && <span>{String(sources[key].input.city)}{sources[key].input.district ? ` · ${sources[key].input.district}` : ''}</span>}
            {Number.isInteger(sources[key].count) && sources[key].count > 0 && <span>{sources[key].count} {c.count}</span>}
            {date(sources[key].observedTo) && <span>{c.observed}: {date(sources[key].observedTo)}</span>}
            {date(sources[key].importedAt) && <span>{c.imported}: {date(sources[key].importedAt)}</span>}
          </div>)}
        </details>
        <button type="button" className={styles.reset} onClick={() => { setValues({ ...BUY_RENT_DEFAULTS }); setSources({}); }}>{c.reset}</button>
      </div>
      <div className={styles.output}>
        {!result ? <p role="alert" id="br-validation" className={styles.error}>{c.validation}</p> : mode === 'afford' ? <>
          <section className={styles.card}>
            <h2>{c.affordTitle}</h2>
            {result.fitsBudget ? <strong className={styles.budgetAmount}>{money(result.price)}</strong> : <p className={styles.error}>{c.noBudget}</p>}
            <dl className={styles.numbers}>{line(c.rent, Number(values.rent))}{line(c.renterCosts, Number(values.renterExtra))}{line(c.ownerCosts, result.ownerCosts)}{line(c.availablePayment, result.payment)}{line(c.loan, result.loan)}{line(c.down, Number(values.down))}</dl>
            <p className={styles.hint}>{c.affordNote}</p>
          </section>
          <section className={styles.card}><h2>{c.upfront}</h2><strong className={styles.amount}>{money(result.upfront)}</strong><p className={styles.hint}>{c.extraCash}</p><dl className={styles.numbers}>{line(c.down, Number(values.down))}{line(c.purchaseFees, Number(values.purchaseFees))}{line(c.renovation, Number(values.renovation))}</dl></section>
          {result.fitsBudget && <section className={styles.card}><h2>{c.durations}</h2><div className={styles.termOptions}>{[10, 20, 30].map((term) => {
            const option = affordableHome(values, term);
            return <button type="button" key={term} aria-pressed={Number(values.term) === term} onClick={() => update('term', term)}><strong>{term} {c.yearsUnit}</strong><span>{c.homeBudget}</span><b>{money(option.price)}</b><span>{c.fullInterest}: {money(option.interest)}</span></button>;
          })}</div></section>}
        </> : <>
          <section className={styles.card}>
            <h2>{c.simpleMonthly}</h2>{repair && <p className={styles.hint}>{c.afterMove}</p>}
            <div className={styles.comparison}>
              <div className={styles.buyOption}><h3>{buyLabel}</h3><strong className={styles.amount}>{money(result.buyerMonthly)}<span> / {c.month}</span></strong><dl className={styles.numbers}>{line(c.mortgage, result.monthlyPaymentAfterMove)}{line(c.ownerCosts, result.buyerMonthly - result.monthlyPaymentAfterMove)}</dl></div>
              <div className={styles.rentOption}><h3>{c.ifRent}</h3><strong className={styles.amount}>{money(result.renterMonthly)}<span> / {c.month}</span></strong><p>{c.includesRenter}</p></div>
            </div>
            <p className={styles.savingsNote}>{Math.abs(result.buyerMonthly - result.renterMonthly) < 1 ? c.monthlyEqual : fill(result.buyerMonthly > result.renterMonthly ? c.monthlyMore : c.monthlyLess, { amount: money(Math.abs(result.buyerMonthly - result.renterMonthly)) })}</p>
            <p className={styles.upfront}>{c.upfront}: <strong>{money(result.upfront)}</strong></p>
          </section>
          {repair && <section className={styles.card}><h2>{c.recoveryTitle}</h2><p className={styles.recovery}>{fill(result.recoveryMonth === null ? c.noRecovery : c.recovery, { years: result.recoveryMonth === null ? values.years : number(result.recoveryMonth / 12) })}</p><p className={styles.hint}>{c.recoveryNote}</p><dl className={styles.numbers}>{line(c.repairTotal, result.repairTotal)}{line(c.loan, result.loan)}{line(c.fullInterest, result.fullLoanInterest)}</dl></section>}
          <section className={styles.card}>
            <h2>{fill(c.paidTitle, { years: values.years })}</h2>
            <PaymentBars result={result} values={values} repair={repair} buyLabel={buyLabel} c={c} money={money} fill={fill} />
            <details className={styles.breakdown}><summary>{c.explainNumbers}</summary><dl className={styles.numbers}>{line(c.upfront, result.upfront)}{line(c.principal, result.principal)}{line(c.interest, result.interest)}{line(c.ownerCosts, result.ongoing)}{repair && line(c.overlap, result.overlapRent)}</dl></details>
          </section>
          <section className={styles.card}>
            <h2>{c.endTitle}</h2>
            <div className={styles.endComparison}>
              <div className={styles.ownershipPanel}>
                <div className={styles.homeSymbol}><HomeIcon /></div>
                <h3>{c.ownHomeShort}</h3>
                {result.loan > 0 ? <>
                  <div className={styles.progressHeading}><span>{c.paidPrincipal}</span><strong>{number(Math.min(100, result.principal / result.loan * 100))}%</strong></div>
                  <div className={styles.loanProgress} role="progressbar" aria-label={c.paidPrincipal} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, result.principal / result.loan * 100))}><span style={{ width: `${Math.min(100, result.principal / result.loan * 100)}%` }} /></div>
                  <p className={styles.debtLabel}>{c.debtShort}</p>
                  <strong className={styles.debtAmount}>{money(result.balance)}</strong>
                  <p className={styles.endCaption}>{result.balance < 0.01 ? c.paidOff : fill(c.timeLeftShort, { years: number(result.monthsLeft / 12) })}</p>
                </> : <div className={styles.noLoan}><span aria-hidden="true">✓</span><p>{c.cashPaid}</p></div>}
              </div>
              <div className={styles.rentalPanel}>
                <div className={styles.homeSymbol}><HomeIcon rented /></div>
                <h3>{c.rentedHomeShort}</h3>
                <div className={styles.rentalStatus}><span aria-hidden="true">⌂</span><p>{repair ? c.unrepairedHome : c.noOwnership}</p></div>
              </div>
            </div>
          </section>
          <details className={`${styles.card} ${styles.tableDetails}`}><summary>{c.chart}</summary><div className={styles.tableScroll}><table><thead><tr>{[c.year, buyLabel, c.ifRent].map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{result.rows.map((row) => <tr key={row.year}><th scope="row">{row.year}</th><td>{money(row.buySpent)}</td><td>{money(row.rentSpent)}</td></tr>)}</tbody></table></div></details>
        </>}
      </div>
    </div>
    <details className={styles.method}><summary>{c.assumptions}</summary>{['method1', 'method2', 'method3', 'repairNote'].map((key) => <p key={key}>{c[key]}</p>)}</details>
    <section className={styles.faq}><h2>{c.faqTitle}</h2>{[1, 2, 3].map((number) => <details key={number}><summary>{c[`faq${number}`]}</summary><p>{c[`answer${number}`]}</p></details>)}</section>
  </main><Footer /></>;
}

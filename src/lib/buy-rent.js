// EUR, fixed-rate loans. No assumed investment returns or future property value.
export const BUY_RENT_STORAGE_KEY = 'catdai-buy-rent-v2';
export const BUY_RENT_DEFAULTS = {
  price: 100000, rent: 500, down: 20000, rate: 7, term: 25, years: 20,
  inflation: 0, rentGrowth: 0, maintenance: 1000, ownerExtra: 30, renterExtra: 0,
  purchaseFees: 2000, renovation: 0, rentSetup: 0,
  repairCost: 20000, repairCash: 5000, repairRate: 9, repairTerm: 5, moveMonths: 3,
};
export const BUY_RENT_LIMITS = {
  price: [1, 10000000], rent: [0, 100000], down: [0, 10000000],
  rate: [0, 30], term: [1, 40], years: [5, 30], inflation: [0, 20], rentGrowth: [-10, 20],
  maintenance: [0, 100000], ownerExtra: [0, 100000], renterExtra: [0, 100000],
  purchaseFees: [0, 1000000], renovation: [0, 1000000], rentSetup: [0, 1000000],
  repairCost: [0, 1000000], repairCash: [0, 1000000], repairRate: [0, 30], repairTerm: [1, 30], moveMonths: [0, 120],
};
export function scenarioFields(mode) {
  const costs = ['maintenance', 'ownerExtra', 'renterExtra'];
  if (mode === 'afford') return ['rent', 'down', 'rate', 'term', 'purchaseFees', 'renovation', ...costs];
  const common = ['rent', 'years', 'inflation', 'rentGrowth', ...costs];
  return mode === 'repair'
    ? [...common, 'repairCost', 'repairCash', 'repairRate', 'repairTerm', 'moveMonths']
    : [...common, 'price', 'down', 'rate', 'term', 'purchaseFees', 'renovation', 'rentSetup'];
}
export function validBuyRentInputs(values, mode = 'compare') {
  return scenarioFields(mode).every((key) => {
    const [min, max] = BUY_RENT_LIMITS[key];
    const value = values[key];
    return value !== '' && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max
      && (!['term', 'years', 'repairTerm', 'moveMonths'].includes(key) || Number.isInteger(Number(value)));
  }) && (mode !== 'compare' || Number(values.down) <= Number(values.price))
    && (mode !== 'repair' || Number(values.repairCash) <= Number(values.repairCost));
}
export function mortgagePayment(principal, annualRate, years) {
  const rate = annualRate / 1200;
  return principal === 0 ? 0 : rate === 0 ? principal / (years * 12)
    : principal * rate / (1 - (1 + rate) ** (-years * 12));
}
export function affordableHome(values, term = Number(values.term)) {
  const v = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  const budget = v.rent + v.renterExtra;
  const ownerCosts = v.maintenance / 12 + v.ownerExtra;
  const payment = Math.max(0, budget - ownerCosts);
  const rate = v.rate / 1200;
  const loan = rate === 0 ? payment * term * 12 : payment * (1 - (1 + rate) ** (-term * 12)) / rate;
  return { term, budget, ownerCosts, payment, loan, price: loan + v.down,
    interest: Math.max(0, payment * term * 12 - loan), upfront: v.down + v.purchaseFees + v.renovation,
    fitsBudget: ownerCosts <= budget };
}
export function simulateBuyRent(values, mode = 'compare') {
  if (!validBuyRentInputs(values, mode)) return null;
  if (mode === 'afford') return affordableHome(values);
  const v = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  const repair = mode === 'repair';
  const loan = repair ? v.repairCost - v.repairCash : v.price - v.down;
  const annualRate = repair ? v.repairRate : v.rate;
  const term = repair ? v.repairTerm : v.term;
  const payment = mortgagePayment(loan, annualRate, term);
  const upfront = repair ? v.repairCash : v.down + v.purchaseFees + v.renovation;
  let balance = loan;
  let interest = 0;
  let principal = 0;
  let buySpent = upfront;
  let rentSpent = repair ? 0 : v.rentSetup;
  let rentOnly = 0;
  let ongoing = 0;
  let overlapRent = 0;
  let recoveryMonth = null;
  const rows = [{ year: 0, buySpent, rentSpent, balance }];
  for (let month = 1; month <= v.years * 12; month++) {
    const year = Math.floor((month - 1) / 12);
    const factor = (1 + v.inflation / 100) ** year;
    const rent = v.rent * (1 + v.rentGrowth / 100) ** year;
    const renting = rent + v.renterExtra * factor;
    const interestThisMonth = balance * annualRate / 1200;
    const paid = month <= term * 12 ? Math.min(payment, balance + interestThisMonth) : 0;
    balance = Math.max(0, balance + interestThisMonth - paid);
    interest += interestThisMonth;
    principal += paid - interestThisMonth;
    const stayingInRent = repair && month <= v.moveMonths;
    const ownerCost = stayingInRent ? 0 : (v.maintenance / 12 + v.ownerExtra) * factor;
    const overlapping = stayingInRent ? renting : 0;
    buySpent += paid + ownerCost + overlapping;
    rentSpent += renting;
    rentOnly += rent;
    ongoing += ownerCost;
    overlapRent += overlapping;
    // Recovery covers the whole repair including all contracted interest, even if the loan is still running.
    const remainingPayments = payment * Math.max(0, term * 12 - month);
    if (repair && month > v.moveMonths && recoveryMonth === null && rentSpent >= buySpent + remainingPayments) recoveryMonth = month;
    if (month % 12 === 0) rows.push({ year: month / 12, buySpent, rentSpent, balance });
  }
  const monthlyPaymentAfterMove = repair && v.moveMonths >= term * 12 ? 0 : payment;
  return { rows, loan, upfront, payment, balance, interest, principal, buySpent, rentSpent, rentOnly,
    ongoing, overlapRent, recoveryMonth, fullLoanInterest: Math.max(0, payment * term * 12 - loan),
    monthlyPaymentAfterMove,
    buyerMonthly: monthlyPaymentAfterMove + v.maintenance / 12 + v.ownerExtra,
    renterMonthly: v.rent + v.renterExtra,
    monthsLeft: loan > 0 ? Math.max(0, term * 12 - v.years * 12) : 0,
    repairTotal: repair ? v.repairCost + Math.max(0, payment * term * 12 - loan) : 0,
  };
}

// Balance sheet, credit rating, loans and bonds (Phase 10.1). Interest follows the real central bank rate of the airline's
// currency in that month (BIS, data/rates.ts) plus a spread for its credit rating, which comes from its debt against its
// earnings and its cash (the way rating agencies look at airlines: leverage = debt incl. leases ÷ EBITDAR). Lenders offer
// unsecured bank loans, cheaper loans secured on owned aircraft, and — for big, sound airlines — bonds; an owned aircraft
// can also be sold to a lessor and leased back. Interest is a cost of every day (P&L "interest", together with what the
// cash earns); the cash goes out monthly. An airline whose cash stays below zero for 60 days is insolvent.
import { getAircraftType } from '../data/aircraft';
import { POINT_VALUE_EUR } from '../data/loyalty';
import { policyRate } from '../data/rates';
import { TAKEOVERS } from '../data/takeovers';
import { book, postMessage } from './core';
import { aircraftMarketValueUsd, bookPnl, bookValue } from './fleet';
import { typicalRentUsd } from './market';
import { convert, money } from './money';
import type { Airline, GameState, Loan } from './state';
import { addMonths, MINUTES_PER_DAY, toDate, yearOf } from './time';

const DAY = MINUTES_PER_DAY;
const YEAR = 365 * DAY;

export type Rating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
export const RATINGS: readonly Rating[] = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];
/** Spread over the central bank rate (percentage points) by rating: what banks and bond markets charge corporates. */
export const SPREAD: Readonly<Record<Rating, number>> = { AAA: 0.6, AA: 0.8, A: 1.1, BBB: 1.7, BB: 3, B: 5, CCC: 9 };
/** Longer money costs a little more (term premium per year of term, at most 1.2 points). */
const TERM_PREMIUM = 0.12;
/** Loans secured on an aircraft: up to 75 % of its market value, for half the spread plus 0.6 points. */
const AIRCRAFT_LTV = 0.75;
/** Cash earns the central bank rate minus this (never below zero). */
const CASH_DISCOUNT = 0.5;
/** Repaying a loan early costs this share of what is repaid. */
const EARLY_FEE = 0.01;
/** Bonds only for airlines with this much revenue a year (EUR) and at least this rating. */
const BOND_MIN_REVENUE_EUR = 1_000_000_000;
export const INSOLVENCY_DAYS = 60;

const eurToBook = (state: GameState, currency: string) => (state.fx[currency] ?? 1) / (state.fx.EUR ?? 1);
const usdToBook = (state: GameState, usd: number, currency: string) => convert(money(usd, 'USD'), currency, state.fx).amount;

// ─── Balance sheet ──────────────────────────────────────────────────────────────

export interface BalanceSheet {
  cash: number;
  /** Cash held as collateral for hedges, and the hedges' value at today's prices (Phase 10.2). */
  collateral: number;
  hedges: number;
  aircraft: number;
  prepayments: number;
  deposits: number;
  other: number;
  totalAssets: number;
  loans: number;
  leases: number;
  loyalty: number;
  totalLiabilities: number;
  equity: number;
}

/** What the airline owns and owes today (book currency; leases as the rent still to pay, like IFRS 16 roughly). */
export function balanceSheet(state: GameState, airline: Airline): BalanceSheet {
  let aircraft = 0;
  let prepayments = 0;
  let deposits = 0;
  let leases = 0;
  for (const a of Object.values(state.aircraft)) {
    if (a.airlineId !== airline.id) continue;
    if (a.owned) aircraft += bookValue(a.owned, state.time);
    if (a.order) prepayments += a.order.payments.reduce((n, p) => n + (p.paid ?? 0), 0);
    // Leases count from delivery (IFRS 16: when the aircraft is there to use).
    if (a.lease && a.status === 'active') {
      deposits += convert(a.lease.deposit, airline.currency, state.fx).amount;
      const months = Math.max(0, (a.lease.endAt - Math.max(state.time, a.lease.startAt)) / (30.4 * DAY));
      leases += usdToBook(state, a.lease.monthlyRent.amount * months, airline.currency) * 0.85;
    }
  }
  let other = 0;
  for (const h of Object.values(state.hangars ?? {})) {
    if (h.airlineId !== airline.id) continue;
    const age = Math.max(0, state.time - h.readyAt) / YEAR;
    other += h.price * Math.max(0, 1 - age / 30);
  }
  const cash = airline.cash.amount;
  const loans = (airline.loans ?? []).reduce((n, l) => n + l.outstanding, 0);
  const loyalty = airline.loyalty?.kind === 'own' ? airline.loyalty.points * POINT_VALUE_EUR * eurToBook(state, airline.currency) : 0;
  const collateral = airline.hedging?.collateral ?? 0;
  const hedges = airline.hedging?.value ?? 0;
  const totalAssets = Math.max(0, cash) + aircraft + prepayments + deposits + other + collateral + Math.max(0, hedges);
  const totalLiabilities = loans + leases + loyalty + Math.max(0, -cash) + Math.max(0, -hedges);
  return { cash, collateral, hedges, aircraft, prepayments, deposits, other, totalAssets, loans, leases, loyalty, totalLiabilities, equity: totalAssets - totalLiabilities };
}

// ─── Credit rating ──────────────────────────────────────────────────────────────

export interface CreditView {
  rating: Rating;
  /** Debt incl. leases minus cash, divided by EBITDAR (years of earnings to pay it back). */
  leverage: number | null;
  /** Cash as a share of a year's revenue. */
  liquidity: number;
  /** Result margin of the last 12 months. */
  margin: number | null;
  /** Revenue of the last 12 months (book currency, scaled up from fewer months). */
  revenue: number;
  ebitdar: number;
  months: number;
}

/** The last year's figures (from up to 12 completed months, scaled to a year). */
function lastYear(state: GameState, airline: Airline): { revenue: number; ebitdar: number; result: number; months: number } {
  const months = state.finance[airline.id]?.months.slice(-12) ?? [];
  if (!months.length) return { revenue: 0, ebitdar: 0, result: 0, months: 0 };
  let revenue = 0;
  let costs = 0;
  let lease = 0;
  let depr = 0;
  let interest = 0;
  for (const m of months) {
    const l = m.lines;
    revenue += l.revenue;
    costs += l.fuel + l.crew + l.maintenance + l.airport + l.handling + l.navigation + l.distribution + l.lease + l.overhead + (l.service ?? 0) + (l.depreciation ?? 0) + (l.disposals ?? 0) + (l.disruption ?? 0) + (l.loyalty ?? 0) + (l.interest ?? 0);
    lease += l.lease;
    depr += l.depreciation ?? 0;
    interest += l.interest ?? 0;
  }
  const k = 12 / months.length;
  const result = (revenue - costs) * k;
  return { revenue: revenue * k, ebitdar: (revenue - costs + lease + depr + interest) * k, result, months: months.length };
}

/** The airline's credit rating, the way agencies look at airlines (debt against earnings, cash, profit, size). */
export function creditView(state: GameState, airline: Airline): CreditView {
  const y = lastYear(state, airline);
  const b = balanceSheet(state, airline);
  const netDebt = b.loans + b.leases - Math.max(0, b.cash);
  const leverage = y.ebitdar > 0 ? Math.max(0, netDebt) / y.ebitdar : null;
  const liquidity = y.revenue > 0 ? b.cash / y.revenue : b.cash > 0 ? 1 : 0;
  const margin = y.revenue > 0 ? y.result / y.revenue : null;
  // Notches from the leverage (0 = AAA … 6 = CCC), then cash, profit, size and track record.
  let notch = leverage === null ? (b.loans + b.leases > 0 ? 6 : 4) : leverage < 1 ? 1 : leverage < 2 ? 2 : leverage < 3 ? 3 : leverage < 4.5 ? 4 : leverage < 6 ? 5 : 6;
  if (liquidity < 0.08) notch++;
  if (liquidity > 0.25) notch--;
  if (margin !== null && margin < 0) notch++;
  if (margin !== null && margin > 0.1) notch--;
  const revenueEur = y.revenue / eurToBook(state, airline.currency);
  if (revenueEur < 500_000_000) notch = Math.max(notch, 4);
  if (y.months < 12) notch = Math.max(notch, 5);
  if (b.cash < 0) notch = 6;
  // Part of a strong group (or owned by the state): lenders count on the parent's support.
  const parent = RATINGS.indexOf((airline.parentRating ?? '') as Rating);
  if (parent >= 0 && b.cash >= 0) notch = Math.min(notch, parent);
  return { rating: RATINGS[Math.max(0, Math.min(6, notch))]!, leverage, liquidity, margin, revenue: y.revenue, ebitdar: y.ebitdar, months: y.months };
}

// ─── Offers ─────────────────────────────────────────────────────────────────────

export interface LoanOffer {
  kind: Loan['kind'];
  /** Interest for the shortest and longest term (per cent a year) and the terms on offer (years). */
  rate: (years: number) => number;
  years: number[];
  min: number;
  max: number;
  aircraftId?: string;
  /** Why it isn't available (null = it is). */
  refusal: null | 'rating' | 'size' | 'limit';
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** What lenders offer the airline today. */
export function loanOffers(state: GameState, airline: Airline): LoanOffer[] {
  const view = creditView(state, airline);
  const base = policyRate(airline.currency, toDate(state.time));
  const spread = SPREAD[view.rating];
  const b = balanceSheet(state, airline);
  const priceLevel = eurToBook(state, airline.currency);
  const offers: LoanOffer[] = [];
  // Bank loans: total debt (with leases) up to 4 years of earnings (startups: a third of their assets).
  const room = view.ebitdar > 0 ? 4 * view.ebitdar - b.loans - b.leases : b.totalAssets / 3 - b.loans;
  offers.push({
    kind: 'bank',
    rate: (years) => round2(base + spread + Math.min(1.2, TERM_PREMIUM * years)),
    years: [1, 2, 3, 5, 7],
    min: Math.round(1_000_000 * priceLevel),
    max: Math.max(0, Math.round(room)),
    refusal: view.rating === 'CCC' ? 'rating' : room < 1_000_000 * priceLevel ? 'limit' : null,
  });
  // Aircraft finance: each owned aircraft not yet pledged.
  const pledged = new Set((airline.loans ?? []).map((l) => l.aircraftId).filter(Boolean));
  for (const a of Object.values(state.aircraft)) {
    if (a.airlineId !== airline.id || !a.owned || a.status !== 'active' || pledged.has(a.id)) continue;
    const value = usdToBook(state, aircraftMarketValueUsd(a, state.time), airline.currency);
    offers.push({
      kind: 'aircraft',
      aircraftId: a.id,
      rate: (years) => round2(base + spread / 2 + 0.6 + Math.min(1.2, TERM_PREMIUM * years)),
      years: [5, 8, 10, 12],
      min: Math.round(Math.min(1_000_000 * priceLevel, value * AIRCRAFT_LTV)),
      max: Math.round(value * AIRCRAFT_LTV),
      refusal: null,
    });
  }
  // Bonds: for big airlines rated BB or better; paid back at the end.
  const big = view.revenue / eurToBook(state, airline.currency) >= BOND_MIN_REVENUE_EUR;
  offers.push({
    kind: 'bond',
    rate: (years) => round2(base + spread * 0.9 + Math.min(1.2, TERM_PREMIUM * years)),
    years: [3, 5, 7, 10],
    min: Math.round(250_000_000 * priceLevel),
    max: Math.max(0, Math.round(Math.min(1_000_000_000 * priceLevel, room))),
    refusal: !big ? 'size' : RATINGS.indexOf(view.rating) > RATINGS.indexOf('BB') ? 'rating' : room < 250_000_000 * priceLevel ? 'limit' : null,
  });
  return offers;
}

// ─── Commands ───────────────────────────────────────────────────────────────────

export type DebtError = 'loanRefused' | 'loanAmount' | 'loanTerm' | 'loanUnknown' | 'bondNoEarly' | 'aircraftPledged' | 'aircraftUnknown' | 'insufficientCash';

const LENDERS: Readonly<Record<Loan['kind'], string>> = { bank: 'bank', aircraft: 'aircraftFinance', bond: 'bondMarket' };

export function takeLoan(state: GameState, airlineId: string, kind: Loan['kind'], amount: number, years: number, aircraftId?: string): DebtError | null {
  const airline = state.airlines[airlineId]!;
  if (airline.bankruptAt) return 'loanRefused';
  const offer = loanOffers(state, airline).find((o) => o.kind === kind && (kind !== 'aircraft' || o.aircraftId === aircraftId));
  if (!offer) return kind === 'aircraft' ? 'aircraftPledged' : 'loanRefused';
  if (offer.refusal) return 'loanRefused';
  if (!offer.years.includes(years)) return 'loanTerm';
  if (!Number.isFinite(amount) || amount < offer.min || amount > offer.max) return 'loanAmount';
  const loan: Loan = {
    id: `L${state.nextId++}`,
    kind,
    lender: LENDERS[kind],
    original: Math.round(amount),
    outstanding: Math.round(amount),
    rate: offer.rate(years),
    startAt: state.time,
    endAt: addMonths(state.time, years * 12),
    amortizing: kind !== 'bond',
    ...(aircraftId ? { aircraftId } : {}),
  };
  (airline.loans ??= []).push(loan);
  book(state, airlineId, 'loan', money(loan.original, airline.currency), loan.id);
  postMessage(state, { airlineId, kind: 'loanTaken', level: 'info', params: { kind, amount: loan.original, currency: airline.currency, rate: loan.rate, years } });
  return null;
}

export function repayLoan(state: GameState, airlineId: string, loanId: string): DebtError | null {
  const airline = state.airlines[airlineId]!;
  const loan = airline.loans?.find((l) => l.id === loanId);
  if (!loan) return 'loanUnknown';
  if (loan.kind === 'bond') return 'bondNoEarly';
  const fee = Math.round(loan.outstanding * EARLY_FEE);
  if (airline.cash.amount < loan.outstanding + fee) return 'insufficientCash';
  book(state, airlineId, 'repayment', money(-loan.outstanding, airline.currency), loan.id);
  const paid = -book(state, airlineId, 'interest', money(-fee, airline.currency), loan.id).amount;
  bookPnl(state, airlineId, 'interest', paid);
  airline.loans = airline.loans!.filter((l) => l.id !== loanId);
  postMessage(state, { airlineId, kind: 'loanRepaid', level: 'info', params: { kind: loan.kind, amount: loan.outstanding, currency: airline.currency } });
  return null;
}

/** Selling an owned aircraft to a lessor and leasing it back for 8 years (cash now, rent from now on). */
export function saleLeaseback(state: GameState, airlineId: string, aircraftId: string): DebtError | null {
  const airline = state.airlines[airlineId]!;
  const a = state.aircraft[aircraftId];
  if (!a || a.airlineId !== airlineId || !a.owned || a.status !== 'active') return 'aircraftUnknown';
  if (airline.loans?.some((l) => l.aircraftId === aircraftId)) return 'aircraftPledged';
  const valueUsd = aircraftMarketValueUsd(a, state.time);
  const price = usdToBook(state, valueUsd, airline.currency);
  const gain = price - bookValue(a.owned, state.time);
  book(state, airlineId, 'saleLeaseback', money(Math.round(price), airline.currency), a.id);
  bookPnl(state, airlineId, 'disposals', -gain);
  const type = getAircraftType(a.typeId);
  const age = Math.max(0, yearOf(state.time) - a.builtYear);
  const rent = Math.round((typicalRentUsd(type, age, yearOf(state.time)) * 1.05) / 1000) * 1000;
  delete a.owned;
  a.lease = { lessor: 'Sale-and-leaseback', monthlyRent: money(rent, 'USD'), deposit: money(0, 'USD'), startAt: state.time, endAt: addMonths(state.time, 96) };
  postMessage(state, { airlineId, kind: 'saleLeaseback', level: 'info', params: { registration: a.registration, amount: Math.round(price), currency: airline.currency, rent } });
  return null;
}

// ─── Daily step ──────────────────────────────────────────────────────────────────

/** Interest of the day into the accounts; on the 1st the month's interest and repayments are paid; insolvency watch. */
export function debtDailyStep(state: GameState): void {
  const date = toDate(state.time);
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || airline.bankruptAt) continue;
    // Games taken over before Phase 10.1: the owner's backing for lenders.
    const scenario = airline.realId ? TAKEOVERS[airline.realId] : undefined;
    if (scenario?.parentRating && !airline.parentRating) airline.parentRating = yearOf(state.time) >= scenario.parentRating.from ? scenario.parentRating.after : scenario.parentRating.before;
    const base = policyRate(airline.currency, date);
    // Interest of yesterday: loans cost, cash earns (each loan at its fixed rate).
    let interest = 0;
    for (const l of airline.loans ?? []) interest += (l.outstanding * l.rate) / 100 / 365;
    if (airline.cash.amount > 0) interest -= (airline.cash.amount * Math.max(0, base - CASH_DISCOUNT)) / 100 / 365;
    // Below zero the bank's overdraft is expensive.
    else interest += (-airline.cash.amount * (Math.max(0, base) + SPREAD.CCC)) / 100 / 365;
    if (interest !== 0) bookPnl(state, airline.id, 'interest', interest);
    airline.interestDue = (airline.interestDue ?? 0) + interest;
    if (date.getUTCDate() === 1) {
      const due = airline.interestDue ?? 0;
      if (Math.abs(due) >= 1) book(state, airline.id, 'interest', money(-Math.round(due), airline.currency));
      airline.interestDue = 0;
      for (const l of [...(airline.loans ?? [])]) {
        const monthsLeft = Math.max(1, Math.round((l.endAt - state.time) / (30.4 * DAY)));
        const part = l.amortizing ? Math.min(l.outstanding, Math.round(l.outstanding / monthsLeft)) : state.time >= l.endAt - 15 * DAY ? l.outstanding : 0;
        if (part > 0) {
          book(state, airline.id, 'repayment', money(-part, airline.currency), l.id);
          l.outstanding -= part;
        }
        if (l.outstanding <= 0) {
          airline.loans = airline.loans!.filter((x) => x.id !== l.id);
          postMessage(state, { airlineId: airline.id, kind: 'loanRepaid', level: 'info', params: { kind: l.kind, amount: l.original, currency: airline.currency } });
        }
      }
    }
    // Insolvency: cash below zero for too long and nobody lends any more.
    if (airline.cash.amount < 0) {
      airline.cashNegativeSince ??= state.time;
      const days = Math.floor((state.time - airline.cashNegativeSince) / DAY);
      if (days > 0 && days % 15 === 0 && days < INSOLVENCY_DAYS) {
        postMessage(state, { airlineId: airline.id, kind: 'insolvencyWarning', level: 'warning', params: { days: INSOLVENCY_DAYS - days } });
      }
      if (days >= INSOLVENCY_DAYS) {
        airline.bankruptAt = state.time;
        postMessage(state, { airlineId: airline.id, kind: 'bankrupt', level: 'warning', params: { name: airline.name } });
      }
    } else delete airline.cashNegativeSince;
  }
}


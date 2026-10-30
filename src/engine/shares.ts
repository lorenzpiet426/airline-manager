// Shares, shareholders and the share price (Phase 10.3). Every airline the player runs has owners: a startup belongs to
// its founder (the player) and investors; a taken-over airline to whoever owned it then (Austrian: the state, from 1988
// the state and the stock exchange, from 2009 the Lufthansa Group). Once a week the share price moves towards what
// investors think the airline is worth — a multiple of its earnings before interest, depreciation and rent (more with
// growth and margin) minus its debt including leases — times the stock market's mood, which follows the economy and the
// crises of the world. Listed airlines can raise money with new shares, pay dividends and buy back shares; private ones
// can go public once big enough. The player is paid a CEO salary and shares, and can trade them outside the weeks before
// results; their personal wealth is the measure of their career.
import {
  BASE_MULTIPLE,
  BLACKOUT_DAYS,
  BUYBACK_PREMIUM,
  CEO_SALARY_EUR_MONTH,
  CEO_SHARES_EUR_YEAR,
  FOUNDER_STAKE,
  IPO_DISCOUNT,
  IPO_FEE,
  IPO_MIN_MONTHS,
  IPO_MIN_REVENUE_EUR,
  MAX_ISSUE_SHARE,
  MAX_MULTIPLE,
  MIN_MULTIPLE,
  MOOD_NOISE,
  MOOD_REVERSION,
  OFFERING_DISCOUNT,
  OFFERING_FEE,
  PRICE_ADJUST,
  PRICE_NOISE,
  STARTUP_SHARES,
  YOUNG_MONTHS,
  type HolderKind,
} from '../data/shares';
import { book, postMessage } from './core';
import { balanceSheet, creditView } from './debt';
import { priceLevelAt } from './era';
import { money } from './money';
import type { Airline, Equity, GameState, Shareholder } from './state';
import { toDate, yearOf, type SimTime } from './time';
import { conditionsOf } from './worldEvents';
import type { EngineWorld } from './world';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const eurToBook = (state: GameState, currency: string) => (state.fx[currency] ?? 1) / (state.fx.EUR ?? 1);

/** A normally distributed number from a text (stable, so the game's other random events stay the same). */
function gauss(text: string): number {
  const h = (s: string) => {
    let x = 2166136261;
    for (const ch of s) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
    x ^= x >>> 15;
    x = Math.imul(x, 2246822507);
    return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
  };
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, h(`${text}a`)))) * Math.cos(2 * Math.PI * h(`${text}b`));
}

export const holder = (e: Equity, kind: HolderKind): Shareholder | undefined => e.holders.find((h) => h.kind === kind);
export const playerShares = (e: Equity | undefined): number => (e ? (holder(e, 'player')?.shares ?? 0) : 0);
/** The player's personal wealth: their shares at today's price plus their own money. */
export const playerWealth = (e: Equity | undefined): number => (e ? playerShares(e) * e.price + e.playerCash : 0);

// ─── Value ──────────────────────────────────────────────────────────────────────

/** Revenue growth over the last year (this year's 12 months against the 12 before; 0 without them). */
function growth(state: GameState, airline: Airline): number {
  const months = state.finance[airline.id]?.months ?? [];
  if (months.length < 24) return 0;
  const sum = (xs: typeof months) => xs.reduce((n, m) => n + m.lines.revenue, 0);
  const prev = sum(months.slice(-24, -12));
  return prev > 0 ? clamp(sum(months.slice(-12)) / prev - 1, -0.3, 0.3) : 0;
}

/** What investors think the airline's shares are worth in all (book currency), before the market's mood. */
export function fundamentalValue(state: GameState, airline: Airline): number {
  const e = airline.equity;
  const view = creditView(state, airline);
  const b = balanceSheet(state, airline);
  const margin = view.margin ?? 0;
  const multiple = clamp(BASE_MULTIPLE * (1 + growth(state, airline)) * (1 + 2 * margin), MIN_MULTIPLE, MAX_MULTIPLE);
  const enterprise = multiple * Math.max(0, view.ebitdar);
  const fromEarnings = enterprise - (b.loans + b.leases - b.cash) + b.investments;
  const floor = Math.max(0.25 * Math.max(0, b.equity), 0.02 * (e?.paidIn ?? 0), 1);
  if (airline.bankruptAt) return 1;
  // A young airline: valued around the money put in and its book value until it has a year of accounts.
  if (view.months < YOUNG_MONTHS && !airline.realId) {
    const young = Math.max(b.equity, 0.8 * (e?.paidIn ?? 0));
    const w = view.months / YOUNG_MONTHS;
    return Math.max(floor, (1 - w) * young + w * fromEarnings);
  }
  return Math.max(floor, fromEarnings);
}

// ─── Owners per scenario ────────────────────────────────────────────────────────

/** Who owns an airline the player starts running (startups: founder + investors; Austrian: by year). */
function startingOwners(state: GameState, airline: Airline): { holders: Shareholder[]; shares: number; listed: boolean } {
  const year = yearOf(state.time);
  if (airline.realId === 'AUA') {
    const shares = 87_000_000;
    if (year >= 2009) return { shares, listed: false, holders: [{ kind: 'group', name: 'Lufthansa Group', shares }] };
    if (year >= 1988) {
      const state51 = Math.round(shares * 0.51);
      return { shares, listed: true, holders: [{ kind: 'state', name: 'Republic of Austria (ÖIAG)', shares: state51 }, { kind: 'public', name: 'public', shares: shares - state51 }] };
    }
    return { shares, listed: false, holders: [{ kind: 'state', name: 'Republic of Austria', shares }] };
  }
  const founder = Math.round(STARTUP_SHARES * FOUNDER_STAKE);
  return { shares: STARTUP_SHARES, listed: false, holders: [{ kind: 'player', name: 'player', shares: founder }, { kind: 'investors', name: 'investors', shares: STARTUP_SHARES - founder }] };
}

/** Every airline the player runs gets its owners (old games too). */
export function ensureEquity(state: GameState): void {
  state.stocks ??= { mood: 1, history: [] };
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || airline.equity) continue;
    const o = startingOwners(state, airline);
    const paidIn = airline.realId ? Math.max(1, balanceSheet(state, airline).equity) : Math.max(1, airline.cash.amount);
    // A player starting a new job brings the wealth of their career (Phase 10.4).
    const brought = Math.round((state.career?.wealthEur ?? 0) * eurToBook(state, airline.currency));
    const e: Equity = { shares: o.shares, listed: o.listed, holders: o.holders, price: 0, history: [], paidIn, playerCash: brought, dividends: [] };
    if (o.listed) e.listedAt = state.time;
    airline.equity = e;
    e.price = Math.max(0.01, fundamentalValue(state, airline) / e.shares);
    e.history.push([state.time, e.price]);
  }
}

// ─── Weekly and monthly ─────────────────────────────────────────────────────────

/** The stock market's mood: drifts back to normal, falls when the economy weakens (recessions, crises), and swings. */
function updateMood(state: GameState, world: EngineWorld): void {
  const s = (state.stocks ??= { mood: 1, history: [] });
  const hub = Object.values(state.airlines).find((a) => a.controller === 'human');
  const airport = hub ? world.airportById.get(hub.hubId) : undefined;
  const economy = airport ? conditionsOf(state, world).demand(airport, airport, 'business') : 1;
  const target = clamp(economy ** 2, 0.3, 1.3);
  s.mood = clamp(s.mood + MOOD_REVERSION * 3 * (target - s.mood) + MOOD_NOISE * gauss(`mood|${state.seed}|${state.time}`), 0.25, 1.6);
  s.history.push([state.time, Math.round(s.mood * 1000) / 1000]);
  if (s.history.length > 104) s.history.splice(0, s.history.length - 104);
}

function updatePrice(state: GameState, airline: Airline): void {
  const e = airline.equity!;
  const target = (fundamentalValue(state, airline) / e.shares) * (state.stocks?.mood ?? 1);
  const noise = e.listed ? PRICE_NOISE * gauss(`px|${airline.id}|${state.time}`) : 0;
  e.price = Math.max(0.01, Math.exp(Math.log(e.price) + PRICE_ADJUST * (Math.log(Math.max(0.01, target)) - Math.log(e.price)) + noise));
  e.history.push([state.time, Math.round(e.price * 10_000) / 10_000]);
  if (e.history.length > 104) e.history.splice(0, e.history.length - 104);
}

/** Issues new shares to a holder (dilutes the others). */
function issue(e: Equity, kind: HolderKind, name: string, shares: number): void {
  const h = holder(e, kind) ?? (e.holders.push({ kind, name, shares: 0 }), e.holders.at(-1)!);
  h.shares += shares;
  e.shares += shares;
}

/** CEO pay: a salary every month; shares once a year (in a group-owned airline their worth in money). */
function payCeo(state: GameState, airline: Airline, january: boolean): void {
  const e = airline.equity!;
  const level = priceLevelAt(state.time) * eurToBook(state, airline.currency);
  e.playerCash += Math.round(CEO_SALARY_EUR_MONTH * level);
  if (!january) return;
  const grant = CEO_SHARES_EUR_YEAR * level;
  if (holder(e, 'group')) e.playerCash += Math.round(grant);
  else {
    const shares = Math.round(grant / Math.max(0.01, e.price));
    issue(e, 'player', 'player', shares);
    postMessage(state, { airlineId: airline.id, kind: 'ceoGrant', level: 'info', params: { shares } });
  }
}

/** Weekly share prices and the market's mood; monthly CEO pay. */
export function sharesDailyStep(state: GameState, world: EngineWorld): void {
  ensureEquity(state);
  const date = toDate(state.time);
  if (date.getUTCDay() === 1) updateMood(state, world);
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || !airline.equity) continue;
    if (date.getUTCDay() === 1) updatePrice(state, airline);
    if (date.getUTCDate() === 1 && !airline.bankruptAt) payCeo(state, airline, date.getUTCMonth() === 0);
  }
}

// ─── What the airline and the player can do ─────────────────────────────────────

export type ShareError = 'notListed' | 'alreadyListed' | 'ipoNotReady' | 'groupOwned' | 'shareInvalid' | 'insufficientCash' | 'blackout' | 'notEnoughShares' | 'notEnoughMoney';

/** Can the airline go public now? (null = yes, else why not) */
export function ipoReady(state: GameState, airline: Airline): ShareError | null {
  const e = airline.equity;
  if (!e) return 'ipoNotReady';
  if (e.listed) return 'alreadyListed';
  if (holder(e, 'group') || holder(e, 'state')) return 'groupOwned';
  const view = creditView(state, airline);
  const revenueEur = view.revenue / eurToBook(state, airline.currency) / priceLevelAt(state.time);
  return view.months >= IPO_MIN_MONTHS && revenueEur >= IPO_MIN_REVENUE_EUR && (view.margin ?? -1) > 0 ? null : 'ipoNotReady';
}

const raise = (state: GameState, airline: Airline, gross: number, fee: number) => {
  const net = Math.round(gross * (1 - fee));
  book(state, airline.id, 'shares', money(net, airline.currency));
  airline.equity!.paidIn += net;
  return net;
};

/** Going public: new shares (a share of the company after the issue) sold to the public below the value. */
export function goPublic(state: GameState, airlineId: string, share: number): ShareError | null {
  const airline = state.airlines[airlineId]!;
  const ready = ipoReady(state, airline);
  if (ready) return ready;
  if (!(share >= 0.1 && share <= 0.4)) return 'shareInvalid';
  const e = airline.equity!;
  const price = e.price * (1 - IPO_DISCOUNT);
  const newShares = Math.round((e.shares * share) / (1 - share));
  issue(e, 'public', 'public', newShares);
  const net = raise(state, airline, newShares * price, IPO_FEE);
  e.listed = true;
  e.listedAt = state.time;
  postMessage(state, { airlineId, kind: 'ipoDone', level: 'info', params: { amount: net, currency: airline.currency, price: Math.round(price * 100) / 100 } });
  return null;
}

/** A listed airline sells new shares (up to 30 % more) slightly below the market price. */
export function issueShares(state: GameState, airlineId: string, share: number): ShareError | null {
  const airline = state.airlines[airlineId]!;
  const e = airline.equity;
  if (!e?.listed) return 'notListed';
  if (!(share > 0 && share <= MAX_ISSUE_SHARE)) return 'shareInvalid';
  const newShares = Math.round(e.shares * share);
  const price = e.price * (1 - OFFERING_DISCOUNT);
  issue(e, 'public', 'public', newShares);
  const net = raise(state, airline, newShares * price, OFFERING_FEE);
  // More shares for the same company: the price falls by the discount's share.
  e.price *= 1 - (OFFERING_DISCOUNT * share) / (1 + share);
  postMessage(state, { airlineId, kind: 'sharesIssued', level: 'info', params: { shares: newShares, amount: net, currency: airline.currency } });
  return null;
}

/** A dividend: cash paid to all shareholders (the player's part goes to their own money). */
export function payDividend(state: GameState, airlineId: string, total: number): ShareError | null {
  const airline = state.airlines[airlineId]!;
  const e = airline.equity;
  if (!e) return 'shareInvalid';
  if (!(total > 0) || total > airline.cash.amount) return 'insufficientCash';
  const perShare = total / e.shares;
  book(state, airlineId, 'dividend', money(-Math.round(total), airline.currency));
  e.playerCash += Math.round(perShare * playerShares(e));
  e.dividends.push({ at: state.time, perShare, total: Math.round(total) });
  if (e.dividends.length > 8) e.dividends.splice(0, e.dividends.length - 8);
  // The money leaves the company: its shares are worth that much less.
  e.price = Math.max(0.01, e.price - perShare);
  postMessage(state, { airlineId, kind: 'dividendPaid', level: 'info', params: { amount: Math.round(total), currency: airline.currency, perShare: Math.round(perShare * 100) / 100 } });
  return null;
}

/** A listed airline buys back shares from the stock market (up to 30 %) at a small premium. */
export function buyBack(state: GameState, airlineId: string, share: number): ShareError | null {
  const airline = state.airlines[airlineId]!;
  const e = airline.equity;
  if (!e?.listed) return 'notListed';
  const pub = holder(e, 'public');
  if (!pub || !(share > 0 && share <= MAX_ISSUE_SHARE)) return 'shareInvalid';
  const shares = Math.min(pub.shares, Math.round(e.shares * share));
  const cost = shares * e.price * (1 + BUYBACK_PREMIUM);
  if (cost > airline.cash.amount) return 'insufficientCash';
  book(state, airlineId, 'shares', money(-Math.round(cost), airline.currency));
  pub.shares -= shares;
  e.shares -= shares;
  postMessage(state, { airlineId, kind: 'sharesBoughtBack', level: 'info', params: { shares, amount: Math.round(cost), currency: airline.currency } });
  return null;
}

/** Last days of a quarter: insiders may not trade before the results. */
export function inBlackout(time: SimTime): boolean {
  const d = toDate(time);
  const next = Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 1);
  return (next - d.getTime()) / 86_400_000 <= BLACKOUT_DAYS;
}

/** The player buys (positive) or sells (negative) own shares on the stock exchange. */
export function tradeOwnShares(state: GameState, airlineId: string, shares: number): ShareError | null {
  const airline = state.airlines[airlineId]!;
  const e = airline.equity;
  if (!e?.listed) return 'notListed';
  if (!Number.isInteger(shares) || shares === 0) return 'shareInvalid';
  if (inBlackout(state.time)) return 'blackout';
  const pub = holder(e, 'public')!;
  const me = holder(e, 'player') ?? (e.holders.push({ kind: 'player', name: 'player', shares: 0 }), e.holders.at(-1)!);
  if (shares > 0) {
    if (shares > pub.shares) return 'notEnoughShares';
    if (shares * e.price > e.playerCash) return 'notEnoughMoney';
  } else if (-shares > me.shares) return 'notEnoughShares';
  pub.shares -= shares;
  me.shares += shares;
  e.playerCash -= Math.round(shares * e.price);
  postMessage(state, { airlineId, kind: 'ownTrade', level: 'info', params: { shares, price: Math.round(e.price * 100) / 100, currency: airline.currency } });
  return null;
}


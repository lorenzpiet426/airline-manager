// Fuel and currency hedging (Phase 10.2). The treasury fixes part of the airline's future fuel and dollar spending month
// by month along a hedging ladder the player sets: fuel swaps fix a price, call options cap it for a premium, currency
// forwards buy dollars at a fixed rate. Every month the month just ended is settled against its average price (the
// result is a P&L line of its own: gains when prices rose above the hedge, losses when they fell), and the ladder is
// topped up at that day's forward prices. Once a week the open contracts are valued; when swaps and forwards lose more
// than the banks allow for the airline's rating, they want cash as collateral (margin calls, as in 2008 and 2020).
import { INTO_PLANE_USD_PER_GAL, jetFuelSpot } from '../data/fuel';
import {
  AVERAGE_OPTION_FACTOR,
  COLLATERAL_FREE,
  FUEL_REVERSION_MONTHS,
  FUEL_VOLATILITY,
  FX_MARGIN,
  LADDER,
  MAX_MONTHS,
  NO_POLICY,
  OPTION_MARGIN,
  SWAP_MARGIN,
  type HedgePolicy,
} from '../data/hedging';
import { policyRate } from '../data/rates';
import { book, postMessage } from './core';
import { creditView } from './debt';
import { bookPnl } from './fleet';
import { money } from './money';
import type { Airline, GameState, HedgeContract, Hedging } from './state';
import { toDate, type SimTime } from './time';
import { conditionsOf, REAL_DATA_END } from './worldEvents';
import type { EngineWorld } from './world';

/** "YYYY-MM" of the month `ahead` months after the one `time` is in. */
export function monthKey(time: SimTime, ahead = 0): string {
  const d = toDate(time);
  const m = d.getUTCFullYear() * 12 + d.getUTCMonth() + ahead;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
}
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm);
};

/** Book currency per US dollar today. */
export const fxSpot = (state: GameState, currency: string) => (state.fx[currency] ?? 1) / (state.fx.USD ?? 1);

function ensure(airline: Airline, state: GameState): Hedging {
  return (airline.hedging ??= {
    policy: { ...NO_POLICY, fuel: [...NO_POLICY.fuel], fx: [...NO_POLICY.fx] },
    contracts: [],
    collateral: 0,
    running: { month: monthKey(state.time), fuel: 0, fx: 0, days: 0 },
    monthly: [],
    settled: [],
    value: 0,
  });
}

// ─── Prices ─────────────────────────────────────────────────────────────────────

/** Fuel price for a month `m` months ahead: from today's price towards the last year's average. */
export function forwardFuel(spot: number, average: number, m: number): number {
  return average + (spot - average) * Math.exp(-m / FUEL_REVERSION_MONTHS);
}

/** Dollars `m` months ahead in book currency (interest rate parity: the higher-rate currency is cheaper forward). */
export function forwardFx(spot: number, rateBook: number, rateUsd: number, m: number): number {
  return spot * ((1 + rateBook / 100) / (1 + rateUsd / 100)) ** (m / 12);
}

function normalCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Price of a call option on the average fuel price of a month `m` months ahead (Black-76, USD per gallon). */
export function callPremium(forward: number, strike: number, m: number, rateUsd: number): number {
  const t = Math.max(1 / 24, m / 12);
  const v = FUEL_VOLATILITY * AVERAGE_OPTION_FACTOR * Math.sqrt(t);
  const d1 = (Math.log(forward / strike) + (v * v) / 2) / v;
  return Math.exp((-rateUsd / 100) * t) * (forward * normalCdf(d1) - strike * normalCdf(d1 - v));
}

const DAY = 24 * 60;

/** Jet fuel spot price at a past time (null if unknown). */
function fuelAt(state: GameState, time: SimTime): number | null {
  if (time < REAL_DATA_END) return jetFuelSpot(toDate(time));
  const hist = state.world?.fuelHistory ?? [];
  let best: number | null = null;
  for (const [t, p] of hist) if (t <= time) best = p;
  return best;
}

/** Today's market: fuel spot and 12-month average, dollar spot, the two central bank rates. */
export function market(state: GameState, world: EngineWorld, airline: Airline) {
  const fuel = conditionsOf(state, world).fuelSpot;
  // The last 12 months' prices: the real ones up to the end of the data, then the game's own weekly prices.
  const months = Array.from({ length: 12 }, (_, k) => fuelAt(state, state.time - (k + 0.5) * 30.4 * DAY)).filter((x): x is number => x !== null);
  const average = months.length ? months.reduce((n, x) => n + x, 0) / months.length : fuel;
  const date = toDate(state.time);
  return { fuel, average, fx: fxSpot(state, airline.currency), rateBook: policyRate(airline.currency, date), rateUsd: policyRate('USD', date) };
}

// ─── What to hedge ──────────────────────────────────────────────────────────────

/** Expected spending a month: gallons of fuel and US dollars (fuel, leases), from the last complete month. */
export function exposure(state: GameState, world: EngineWorld, airline: Airline): { gallons: number; usd: number } {
  const fin = state.finance[airline.id];
  const month = fin?.months.at(-1);
  const lines = month?.lines ?? fin?.week.lines;
  if (!lines || !fin) return { gallons: 0, usd: 0 };
  // Scaled to a whole month (the first month of a game may be only a few days long).
  const from = month ? month.start : fin.week.start;
  const to = month ? fin.month.start : state.time;
  const scale = 30.4 / Math.max(1, (to - from) / (24 * 60));
  const px = fxSpot(state, airline.currency);
  const fuelUsd = (lines.fuel * scale) / px;
  const spot = conditionsOf(state, world).fuelSpot;
  const gallons = fuelUsd / Math.max(0.3, spot + INTO_PLANE_USD_PER_GAL);
  const usd = airline.currency === 'USD' ? 0 : fuelUsd + (lines.lease * scale) / px;
  return { gallons, usd };
}

const shareFor = (shares: readonly number[], m: number) => {
  const i = LADDER.findIndex(([a, b]) => m >= a && m <= b);
  return i >= 0 ? (shares[i] ?? 0) : 0;
};

/** Buys one contract (cash for option premiums). */
function buy(state: GameState, world: EngineWorld, airline: Airline, kind: HedgeContract['kind'], m: number, amount: number, strikeOffset = 0.1): HedgeContract | null {
  if (amount <= 0) return null;
  const h = ensure(airline, state);
  const mk = market(state, world, airline);
  const month = monthKey(state.time, m);
  let price: number;
  let premium: number | undefined;
  if (kind === 'fxForward') price = forwardFx(mk.fx, mk.rateBook, mk.rateUsd, m) * (1 + FX_MARGIN);
  else {
    const fwd = forwardFuel(mk.fuel, mk.average, m);
    if (kind === 'fuelSwap') price = fwd * (1 + SWAP_MARGIN);
    else {
      price = fwd * (1 + strikeOffset);
      premium = Math.round(callPremium(fwd, price, m, mk.rateUsd) * (1 + OPTION_MARGIN) * amount * mk.fx);
      book(state, airline.id, 'hedge', money(-premium, airline.currency));
    }
  }
  const c: HedgeContract = { id: `H${state.nextId++}`, kind, month, amount: Math.round(amount), price: Math.round(price * 10_000) / 10_000, ...(premium ? { premium } : {}), tradedAt: state.time };
  h.contracts.push(c);
  return c;
}

/** The treasury tops the ladder up to the policy for each month ahead (never sells what is already hedged). */
export function topUp(state: GameState, world: EngineWorld, airline: Airline): void {
  const h = airline.hedging;
  if (!h) return;
  const e = exposure(state, world, airline);
  for (let m = 1; m <= MAX_MONTHS; m++) {
    const month = monthKey(state.time, m);
    const have = (kinds: HedgeContract['kind'][]) => h.contracts.filter((c) => c.month === month && kinds.includes(c.kind)).reduce((n, c) => n + c.amount, 0);
    const fuelGap = shareFor(h.policy.fuel, m) * e.gallons - have(['fuelSwap', 'fuelCall']);
    // Small top-ups aren't worth a deal.
    if (fuelGap > e.gallons * 0.05) {
      buy(state, world, airline, 'fuelCall', m, fuelGap * h.policy.optionShare, h.policy.strikeOffset);
      buy(state, world, airline, 'fuelSwap', m, fuelGap * (1 - h.policy.optionShare));
    }
    const fxGap = shareFor(h.policy.fx, m) * e.usd - have(['fxForward']);
    if (fxGap > e.usd * 0.05) buy(state, world, airline, 'fxForward', m, fxGap);
  }
}

// ─── Settlement and valuation ───────────────────────────────────────────────────

/** Settles the contracts of a month that has ended against its average prices. */
function settle(state: GameState, airline: Airline, month: string, fuelAvg: number, fxAvg: number): void {
  const h = airline.hedging!;
  let fuel = 0;
  let fx = 0;
  let premiums = 0;
  for (const c of h.contracts.filter((x) => x.month === month)) {
    if (c.kind === 'fuelSwap') fuel += (fuelAvg - c.price) * c.amount * fxAvg;
    else if (c.kind === 'fuelCall') {
      fuel += Math.max(0, fuelAvg - c.price) * c.amount * fxAvg;
      premiums += c.premium ?? 0;
    } else fx += (fxAvg - c.price) * c.amount;
  }
  h.contracts = h.contracts.filter((x) => x.month !== month);
  if (!fuel && !fx && !premiums) return;
  const cash = Math.round(fuel + fx);
  if (cash) book(state, airline.id, 'hedge', money(cash, airline.currency));
  // Gains lower the costs, losses and premiums raise them.
  bookPnl(state, airline.id, 'hedging', -(fuel + fx) + premiums);
  h.settled.push({ month, fuel: Math.round(fuel), fx: Math.round(fx), premiums: Math.round(premiums) });
  if (h.settled.length > 24) h.settled.splice(0, h.settled.length - 24);
  postMessage(state, { airlineId: airline.id, kind: 'hedgeSettled', level: 'info', params: { month, result: Math.round(fuel + fx - premiums), currency: airline.currency } });
}

/** Value of the open contracts at today's prices (book currency): swaps/forwards (collateral) and options. */
export function valuation(state: GameState, world: EngineWorld, airline: Airline): { linear: number; options: number } {
  const h = airline.hedging;
  if (!h) return { linear: 0, options: 0 };
  const mk = market(state, world, airline);
  const now = monthKey(state.time);
  let linear = 0;
  let options = 0;
  for (const c of h.contracts) {
    const m = Math.max(0, monthsBetween(now, c.month));
    if (c.kind === 'fxForward') linear += (forwardFx(mk.fx, mk.rateBook, mk.rateUsd, m) - c.price) * c.amount;
    else {
      const fwd = forwardFuel(mk.fuel, mk.average, m);
      if (c.kind === 'fuelSwap') linear += (fwd - c.price) * c.amount * mk.fx;
      else options += callPremium(fwd, c.price, m, mk.rateUsd) * c.amount * mk.fx;
    }
  }
  return { linear, options };
}

/** Weekly: the banks want collateral for losses on swaps and forwards beyond what they allow for the rating. */
function margin(state: GameState, world: EngineWorld, airline: Airline): void {
  const h = airline.hedging!;
  const v = valuation(state, world, airline);
  h.value = Math.round(v.linear + v.options);
  const view = creditView(state, airline);
  const free = (COLLATERAL_FREE[view.rating] ?? 0) * Math.max(0, view.revenue);
  const needed = Math.max(0, Math.round(-v.linear - free));
  const change = needed - h.collateral;
  if (Math.abs(change) < 1) return;
  book(state, airline.id, 'collateral', money(-change, airline.currency));
  h.collateral = needed;
  if (change > 0) postMessage(state, { airlineId: airline.id, kind: 'marginCall', level: 'caution', params: { amount: change, total: needed, currency: airline.currency } });
}

/** Daily: the month's average prices; on the 1st settlement and top-up; on Mondays valuation and collateral. */
export function hedgingDailyStep(state: GameState, world: EngineWorld): void {
  const date = toDate(state.time);
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || !airline.hedging || airline.bankruptAt) continue;
    const h = airline.hedging;
    const mk = market(state, world, airline);
    const month = monthKey(state.time);
    if (h.running.month !== month) {
      const done = h.running;
      const fuelAvg = done.days ? done.fuel / done.days : mk.fuel;
      const fxAvg = done.days ? done.fx / done.days : mk.fx;
      h.monthly.push({ month: done.month, fuel: fuelAvg, fx: fxAvg });
      if (h.monthly.length > 13) h.monthly.splice(0, h.monthly.length - 13);
      // Everything due up to the month that just ended (also months missed by an old save).
      for (const due of [...new Set(h.contracts.map((c) => c.month))].filter((k) => k <= done.month).sort()) settle(state, airline, due, fuelAvg, fxAvg);
      h.running = { month, fuel: 0, fx: 0, days: 0 };
      topUp(state, world, airline);
    }
    h.running.fuel += mk.fuel;
    h.running.fx += mk.fx;
    h.running.days += 1;
    if (date.getUTCDay() === 1) margin(state, world, airline);
  }
}

// ─── Commands ───────────────────────────────────────────────────────────────────

export type HedgeError = 'hedgePolicyInvalid' | 'hedgeDealInvalid' | 'insufficientCash';

export function setHedgePolicy(state: GameState, world: EngineWorld, airlineId: string, policy: HedgePolicy): HedgeError | null {
  const airline = state.airlines[airlineId]!;
  const share = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;
  if (![...policy.fuel, ...policy.fx].every(share) || policy.fuel.length !== 3 || policy.fx.length !== 3 || !share(policy.optionShare) || !(policy.strikeOffset >= 0 && policy.strikeOffset <= 0.5)) {
    return 'hedgePolicyInvalid';
  }
  const h = ensure(airline, state);
  h.policy = { fuel: [...policy.fuel] as HedgePolicy['fuel'], fx: [...policy.fx] as HedgePolicy['fx'], optionShare: policy.optionShare, strikeOffset: policy.strikeOffset };
  topUp(state, world, airline);
  return null;
}

/** A single deal by hand: a fuel swap or call, or a dollar forward, for a month 1–24 ahead. */
export function hedgeDeal(state: GameState, world: EngineWorld, airlineId: string, kind: HedgeContract['kind'], monthsAhead: number, amount: number): HedgeError | null {
  const airline = state.airlines[airlineId]!;
  if (!Number.isInteger(monthsAhead) || monthsAhead < 1 || monthsAhead > MAX_MONTHS || !Number.isFinite(amount) || amount <= 0) return 'hedgeDealInvalid';
  if (kind === 'fxForward' && airline.currency === 'USD') return 'hedgeDealInvalid';
  const h = ensure(airline, state);
  if (kind === 'fuelCall') {
    const mk = market(state, world, airline);
    const fwd = forwardFuel(mk.fuel, mk.average, monthsAhead);
    const cost = callPremium(fwd, fwd * (1 + h.policy.strikeOffset), monthsAhead, mk.rateUsd) * (1 + OPTION_MARGIN) * amount * mk.fx;
    if (airline.cash.amount < cost) return 'insufficientCash';
  }
  buy(state, world, airline, kind, monthsAhead, amount, h.policy.strikeOffset);
  return null;
}

/** Starts hedging for an airline with a policy (takeovers: the group's ladder, bought at once). */
export function startHedging(state: GameState, world: EngineWorld, airlineId: string, policy: HedgePolicy): void {
  const airline = state.airlines[airlineId]!;
  const h = ensure(airline, state);
  h.policy = { fuel: [...policy.fuel] as HedgePolicy['fuel'], fx: [...policy.fx] as HedgePolicy['fx'], optionShare: policy.optionShare, strikeOffset: policy.strikeOffset };
  topUp(state, world, airline);
}

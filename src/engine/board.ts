// The board of directors (Phase 10.4). Whoever owns the airline sets the CEO's targets each year (venture investors,
// the stock market, the state or a group, see data/board.ts) and the supervisory board reviews them every quarter: met
// targets raise its confidence in the CEO, misses lower it — less in a new CEO's first year and in a crisis. Strikes and
// cash below zero cost confidence between reviews. Below 40 the board gives a formal warning; still below 20 at a later
// review it dismisses the CEO, unless the player holds the majority of the shares. Bankruptcy ends the job too. The
// player keeps their wealth and can start a new job (a startup, or a real airline that offers one): their career.
import {
  CASH_MONTHS_GOAL,
  CASH_NEGATIVE_POINTS,
  CRISIS_DEMAND,
  CRISIS_FACTOR,
  DESTINATIONS_GOAL,
  DISMISS_BELOW,
  HONEYMOON_FACTOR,
  HONEYMOON_MONTHS,
  INJECTION_MONTHS,
  INJECTION_POINTS,
  JOBS_GOAL,
  MARGIN_RULE,
  OFFER_MIN_MARGIN,
  OFFER_MIN_YEARS,
  ON_TIME_MAX_GOAL,
  OWNER_TARGETS,
  REVIEW_POINTS,
  SCALE,
  SHAREHOLDER_SEATS,
  START_CONFIDENCE,
  STARTUP_MARGIN,
  STRIKE_POINTS,
  WARNING_BELOW,
  WARNING_LIFTED,
} from '../data/board';
import { book, postMessage } from './core';
import { money } from './money';
import { sumPeriods } from './finance';
import { periodKpis } from './kpis';
import { holder, playerShares, playerWealth } from './shares';
import { pnlCosts, type Airline, type Board, type BoardReview, type BoardTarget, type CareerJob, type GameState, type OwnerKind, type TargetKind } from './state';
import { MINUTES_PER_DAY, startOfMonth, toDate, yearOf } from './time';
import { conditionsOf } from './worldEvents';
import type { EngineWorld } from './world';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const MONTH = 30.44 * MINUTES_PER_DAY;
const eurToBook = (state: GameState, currency: string) => (state.fx[currency] ?? 1) / (state.fx.EUR ?? 1);

/** Who the owners are: a group, the state, the stock market, or (a private startup) its investors. */
export function ownerOf(airline: Airline): OwnerKind {
  const e = airline.equity;
  if (e && holder(e, 'group')) return 'group';
  if (e && holder(e, 'state')) return 'state';
  return e?.listed ? 'public' : 'investors';
}

/** The player holds the majority of the votes: no board can dismiss them. */
export const playerControls = (airline: Airline): boolean => !!airline.equity && playerShares(airline.equity) * 2 > airline.equity.shares;

// ─── Measuring ──────────────────────────────────────────────────────────────────

/** The last (up to) 12 completed months since the CEO started. */
function tenureMonths(state: GameState, airline: Airline, board: Board, last = 12) {
  const from = startOfMonth(board.since);
  return (state.finance[airline.id]?.months ?? []).filter((m) => m.start >= from).slice(-last);
}

/** Pilots and cabin crew employed (incl. those in training). */
export function staffOf(airline: Airline): number {
  let n = 0;
  for (const st of Object.values(airline.crew?.stations ?? {})) {
    n += st.cabin;
    for (const p of Object.values(st.pilots)) n += p.captains + p.firstOfficers;
    for (const b of st.pipeline) if (b.source === 'hire') n += b.count;
  }
  return n;
}

export const destinationsOf = (state: GameState, airline: Airline): number => Object.values(state.routes).filter((r) => r.airlineId === airline.id).length;

/** A target's value today (null without data). */
export function measure(state: GameState, airline: Airline, board: Board, t: BoardTarget): number | null {
  const months = tenureMonths(state, airline, board);
  const k = months.length ? periodKpis(sumPeriods(months[0]!.start, months), state.routes, 30 * months.length, 1) : null;
  switch (t.kind) {
    case 'margin':
      return k?.margin ?? null;
    case 'onTime':
      return k?.onTime ?? null;
    case 'transfer': {
      if (!k?.pax) return null;
      let transfer = 0;
      for (const m of months) for (const s of Object.values(m.routes)) transfer += s.transfer ?? 0;
      return transfer / k.pax;
    }
    case 'sharePrice': {
      const e = airline.equity;
      if (!e || !t.base || !t.base2) return null;
      return e.price / t.base / ((state.stocks?.mood ?? 1) / t.base2) - 1;
    }
    case 'jobs':
      return t.base ? staffOf(airline) / t.base - 1 : null;
    case 'destinations':
      return t.base ? destinationsOf(state, airline) / t.base - 1 : null;
    case 'cash': {
      const recent = months.slice(-3);
      const costs = recent.reduce((s, m) => s + pnlCosts(m.lines), 0) / Math.max(1, recent.length);
      return costs > 0 ? airline.cash.amount / costs : null;
    }
  }
}

/** Months of accounts the company has (a startup's age). */
const companyMonths = (state: GameState, airline: Airline) => state.finance[airline.id]?.months.length ?? 0;

/** The goal for a target, from last year's value (null: no baseline yet). */
function goalFor(state: GameState, airline: Airline, board: Board, t: BoardTarget): number | null {
  switch (t.kind) {
    case 'margin': {
      if (board.owner === 'investors' && !airline.realId) {
        const year = Math.floor(companyMonths(state, airline) / 12);
        if (year < STARTUP_MARGIN.length) return STARTUP_MARGIN[year]!;
      }
      if (tenureMonths(state, airline, board).length < 3) return null;
      const last = measure(state, airline, board, t);
      if (last === null) return null;
      const r = MARGIN_RULE[board.owner];
      return Math.min(r.max, last + (last < r.floor ? 2 : 1) * r.step);
    }
    case 'onTime': {
      const last = tenureMonths(state, airline, board).length >= 3 ? measure(state, airline, board, t) : null;
      return last === null ? null : Math.min(ON_TIME_MAX_GOAL, last + 0.01);
    }
    case 'transfer': {
      const last = tenureMonths(state, airline, board).length >= 3 ? measure(state, airline, board, t) : null;
      return last === null ? null : Math.max(0, last - 0.01);
    }
    case 'sharePrice':
      return 0;
    case 'jobs':
      return JOBS_GOAL;
    case 'destinations':
      return DESTINATIONS_GOAL;
    case 'cash':
      return CASH_MONTHS_GOAL;
  }
}

/** The owners' targets for a new year (or a new CEO). */
function setTargets(state: GameState, airline: Airline, board: Board): void {
  board.owner = ownerOf(airline);
  board.year = yearOf(state.time);
  board.targets = (Object.entries(OWNER_TARGETS[board.owner]) as [TargetKind, number][]).map(([kind, weight]) => {
    const t: BoardTarget = { kind, weight, goal: null };
    if (kind === 'sharePrice') {
      t.base = airline.equity?.price;
      t.base2 = state.stocks?.mood ?? 1;
    }
    if (kind === 'jobs') t.base = staffOf(airline);
    if (kind === 'destinations') t.base = destinationsOf(state, airline);
    t.goal = goalFor(state, airline, board, t);
    return t;
  });
}

/** Every airline the player runs gets a board (old games too: the board starts now). */
export function ensureBoard(state: GameState): void {
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || airline.board || !airline.equity) continue;
    const board: Board = { owner: ownerOf(airline), since: state.time, year: yearOf(state.time), targets: [], confidence: START_CONFIDENCE, reviews: [], events: [] };
    airline.board = board;
    setTargets(state, airline, board);
  }
}

// ─── Reviews ────────────────────────────────────────────────────────────────────

/** The economy at the hub is weak (a recession or crisis). */
function inCrisis(state: GameState, world: EngineWorld, airline: Airline): boolean {
  const hub = world.airportById.get(airline.hubId);
  return !!hub && conditionsOf(state, world).demand(hub, hub, 'business') < CRISIS_DEMAND;
}

const inHoneymoon = (state: GameState, board: Board) => state.time - board.since < HONEYMOON_MONTHS * MONTH;

/** The quarterly review: targets scored, confidence moved, a warning or the dismissal. */
export function review(state: GameState, world: EngineWorld, airline: Airline): BoardReview {
  const board = airline.board!;
  const results: BoardReview['results'] = [];
  let total = 0;
  let weights = 0;
  for (const t of board.targets) {
    // Targets without a baseline get one at the first review with enough months.
    if (t.goal === null) {
      t.goal = goalFor(state, airline, board, t);
      continue;
    }
    const value = measure(state, airline, board, t);
    if (value === null) continue;
    const score = clamp((value - t.goal) / SCALE[t.kind], -1, 1);
    results.push({ kind: t.kind, value, goal: t.goal, score });
    total += t.weight * score;
    weights += t.weight;
  }
  let delta = weights > 0 ? (REVIEW_POINTS * total) / weights : 0;
  const crisis = inCrisis(state, world, airline);
  if (delta < 0 && crisis) delta *= CRISIS_FACTOR;
  if (delta < 0 && inHoneymoon(state, board)) delta *= HONEYMOON_FACTOR;
  board.confidence = clamp(board.confidence + delta, 0, 100);

  let outcome: BoardReview['outcome'] = delta >= 0 ? 'fine' : 'concern';
  if (board.confidence < DISMISS_BELOW && board.warnedAt !== undefined && !inHoneymoon(state, board) && !playerControls(airline)) outcome = 'dismissed';
  else if (board.confidence < WARNING_BELOW && board.warnedAt === undefined) {
    board.warnedAt = state.time;
    outcome = 'warning';
  } else if (board.confidence >= WARNING_LIFTED) delete board.warnedAt;

  const r: BoardReview = { at: state.time, confidence: Math.round(board.confidence * 10) / 10, delta: Math.round(delta * 10) / 10, results, crisis, outcome };
  board.reviews.push(r);
  if (board.reviews.length > 12) board.reviews.splice(0, board.reviews.length - 12);
  const params = { confidence: Math.round(board.confidence), delta: r.delta };
  if (outcome === 'dismissed') dismiss(state, airline, 'dismissed');
  else postMessage(state, { airlineId: airline.id, kind: outcome === 'warning' ? 'boardWarning' : 'boardReview', level: outcome === 'fine' ? 'info' : 'warning', params });
  return r;
}

/** The job ends: dismissed by the board or the airline bankrupt. The player keeps their wealth. */
export function dismiss(state: GameState, airline: Airline, reason: CareerJob['reason']): void {
  const board = airline.board!;
  board.dismissedAt = state.time;
  state.dismissed = state.time;
  const months = (state.finance[airline.id]?.months ?? []).filter((m) => m.start >= startOfMonth(board.since));
  const k = months.length ? periodKpis(sumPeriods(months[0]!.start, months), state.routes, 30, 1) : null;
  const career = (state.career ??= { jobs: [], wealthEur: 0 });
  career.jobs.push({ airline: airline.name, ...(airline.realId ? { realId: airline.realId } : {}), from: board.since, to: state.time, reason, margin: k?.margin ?? null });
  career.wealthEur = Math.round(playerWealth(airline.equity) / eurToBook(state, airline.currency));
  postMessage(state, { airlineId: airline.id, kind: 'ceoDismissed', level: 'warning', params: { reason } });
}

/** Daily: strikes and cash below zero cost confidence; quarterly reviews; new targets every January; bankruptcy. */
export function boardDailyStep(state: GameState, world: EngineWorld): void {
  if (state.dismissed) return;
  ensureBoard(state);
  const date = toDate(state.time);
  for (const airline of Object.values(state.airlines)) {
    const board = airline.board;
    if (airline.controller !== 'human' || !board || board.dismissedAt) continue;
    if (airline.bankruptAt) {
      dismiss(state, airline, 'bankrupt');
      continue;
    }
    const event = (kind: Board['events'][number]['kind'], delta: number) => {
      board.confidence = clamp(board.confidence + delta, 0, 100);
      board.events.push({ at: state.time, kind, delta });
      if (board.events.length > 20) board.events.splice(0, board.events.length - 20);
    };
    for (const a of Object.values(airline.labour ?? {})) {
      for (const s of a.strikes) if (s.from >= state.time - MINUTES_PER_DAY && s.from < state.time) event('strike', STRIKE_POINTS);
    }
    if (date.getUTCDate() === 1 && airline.cash.amount < 0) event('cashNegative', CASH_NEGATIVE_POINTS);
    // A group or the state covers the losses with fresh capital rather than letting its airline fail.
    if (airline.cash.amount < 0 && (board.owner === 'group' || board.owner === 'state')) {
      const fin = state.finance[airline.id];
      const recent = fin?.months.length ? fin.months.slice(-3) : fin ? [fin.month] : [];
      const costs = recent.reduce((s, m) => s + pnlCosts(m.lines), 0) / Math.max(1, recent.length);
      const amount = Math.round(-airline.cash.amount + INJECTION_MONTHS * costs);
      book(state, airline.id, 'shares', money(amount, airline.currency));
      if (airline.equity) airline.equity.paidIn += amount;
      delete airline.cashNegativeSince;
      event('capitalInjection', INJECTION_POINTS);
      const owner = airline.equity?.holders.find((h) => h.kind === board.owner)?.name ?? '';
      postMessage(state, { airlineId: airline.id, kind: 'capitalInjection', level: 'warning', params: { amount, currency: airline.currency, owner } });
    }
    if (date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0 && state.time - board.since >= 45 * MINUTES_PER_DAY) review(state, world, airline);
    if (state.dismissed) return;
    if (date.getUTCDate() === 1 && date.getUTCMonth() === 0 && board.year < date.getUTCFullYear()) {
      setTargets(state, airline, board);
      postMessage(state, { airlineId: airline.id, kind: 'boardTargets', level: 'info', params: { year: board.year } });
    }
  }
}

// ─── The board's members and the career ─────────────────────────────────────────

export interface BoardSeat {
  /** A holder kind, or 'employees'. */
  kind: string;
  name: string;
  seats: number;
}

/**
 * The supervisory board: six seats for the shareholders, shared by the D'Hondt method (the stock market's seats go to
 * independent members elected at the general meeting), plus employee seats in Austria (a third) and Germany (a third
 * above 500 staff, half above 2,000).
 */
export function boardSeats(airline: Airline, country: string): BoardSeat[] {
  const e = airline.equity;
  if (!e) return [];
  const holders = e.holders.filter((h) => h.shares > 0);
  const seats = holders.map(() => 0);
  for (let i = 0; i < SHAREHOLDER_SEATS; i++) {
    let best = 0;
    for (let j = 1; j < holders.length; j++) if (holders[j]!.shares / (seats[j]! + 1) > holders[best]!.shares / (seats[best]! + 1)) best = j;
    seats[best]!++;
  }
  const out: BoardSeat[] = holders.map((h, i) => ({ kind: h.kind, name: h.name, seats: seats[i]! })).filter((s) => s.seats > 0);
  const staff = staffOf(airline);
  const employees = country === 'AT' ? (staff >= 300 || e.listed ? SHAREHOLDER_SEATS / 2 : 0) : country === 'DE' ? (staff > 2000 ? SHAREHOLDER_SEATS : staff > 500 ? SHAREHOLDER_SEATS / 2 : 0) : 0;
  if (employees) out.push({ kind: 'employees', name: 'employees', seats: employees });
  return out;
}

/** Years as CEO and the average margin over them (weighted by time). */
export function careerRecord(career: { jobs: CareerJob[] } | undefined): { years: number; margin: number | null } {
  let years = 0;
  let weighted = 0;
  let counted = 0;
  for (const j of career?.jobs ?? []) {
    const y = (j.to - j.from) / (365.25 * MINUTES_PER_DAY);
    years += y;
    if (j.margin !== null) {
      weighted += y * j.margin;
      counted += y;
    }
  }
  return { years, margin: counted > 0 ? weighted / counted : null };
}

/** Real airlines offering the dismissed player a job (only those that can be taken over; not the one that fired them). */
export function jobOffers(state: GameState): string[] {
  const record = careerRecord(state.career);
  const last = state.career?.jobs.at(-1);
  if (record.years < OFFER_MIN_YEARS || (record.margin ?? -1) < OFFER_MIN_MARGIN) return [];
  return ['AUA'].filter((id) => last?.realId !== id);
}

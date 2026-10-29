// Maintenance (Phase 4.2). Every aircraft counts its flight hours. A-checks happen overnight at the hub when the
// aircraft has a long enough night there (otherwise it loses a day); C- and D-checks take it out of service for days or
// weeks. The game plans each heavy check ahead (in the low season if it can) and the player can move it. Checks are done
// by an MRO (maintenance company) or in the airline's own hangar. Leased aircraft pay maintenance reserves to the lessor,
// who pays the heavy checks from them. Technical failures ground aircraft for hours or days: flights are cancelled,
// passengers are compensated (EU 261) and the reputation suffers.
import { repaintWithCheck } from './livery';
import { getAircraftType, type AircraftType } from '../data/aircraft';
import {
  careEur,
  checkQuote,
  CLAIM_SHARE,
  eu261Eur,
  EU261_COUNTRIES,
  failureChance,
  failureHours,
  fitsHangar,
  HANGAR_BUILD_MONTHS,
  HANGAR_FIRST_PAYMENT,
  HANGAR_LIFE_YEARS,
  HANGARS,
  OWN_HANGAR_PRICE_SHARE,
  PLAN_AHEAD_DAYS,
  PROGRAMME,
  REPAIR_USD,
  reserveRateUsd,
  SHORT_NOTICE_DAYS,
  SHORT_NOTICE_PREMIUM,
  TYPICAL_FH_PER_YEAR,
  type HangarSize,
  type HeavyCheck,
} from '../data/maintenance';
import { book, nextId, postMessage, schedule } from './core';
import { bookPnl } from './fleet';
import { weeklyLegs } from './flights';
import { convert, money } from './money';
import { priceLevelAt } from './era';
import { random } from './rng';
import { addExperience } from './reputation';
import { aogCancels, busyIntervals, grounded, pairBlocks, pairDepartureUtc, pairsOfAircraft } from './schedule';
import type { Aircraft, CheckRecord, GameState, Hangar, MaintState } from './state';
import { addMonths, MINUTES_PER_DAY, MINUTES_PER_WEEK, simTime, startOfDay, startOfWeek, toDate, yearOf, type SimTime } from './time';
import { hasDay, seedOf } from './timetable';
import type { EngineWorld } from './world';

const YEAR_MIN = 365.25 * MINUTES_PER_DAY;
/** EU 261 (passenger compensation for cancellations) applies from this day. */
const EU261_FROM = simTime(2005, 2, 17);
const DAY = MINUTES_PER_DAY;

const ageOf = (a: Pick<Aircraft, 'builtYear'>, time: SimTime) => Math.max(0, yearOf(time) - a.builtYear);
const usdToBook = (state: GameState, usd: number, currency: string) => convert(money(usd, 'USD'), currency, state.fx).amount;

// ─── Starting state ────────────────────────────────────────────────────────────

/**
 * Maintenance history of an aircraft entering the fleet. New aircraft start fresh; lessors hand over aircraft after a
 * "transition" C-check; used aircraft bought on the market are somewhere in their cycles (from `key`, so the sale
 * offer and the aircraft agree).
 */
export function initialMaint(key: string, type: AircraftType, builtYear: number, now: SimTime, how: 'new' | 'transition' | 'used'): MaintState {
  const p = PROGRAMME[type.category];
  const perYear = TYPICAL_FH_PER_YEAR[type.category];
  const age = how === 'new' ? 0 : Math.max(0.5, yearOf(now) - builtYear + 0.5);
  const fh = Math.round(age * perYear);
  const rng = { rng: seedOf(key) };
  const ago = (years: number): CheckRecord => ({ at: Math.round(now - years * YEAR_MIN), fh: Math.max(0, Math.round(fh - years * perYear)) });
  const fresh: CheckRecord = { at: now, fh };
  if (how === 'new') return { fh: 0, a: fresh, c: fresh, d: fresh };
  // The last heavy check: when it was built, or some time in the current D-cycle.
  const d = age < p.dYears ? ago(age) : ago(random(rng) * p.dYears);
  const cCycleYears = Math.min(p.cMonths / 12, p.cFh / perYear);
  const c = how === 'transition' ? fresh : ago(Math.min(random(rng) * cCycleYears, (now - d.at) / YEAR_MIN));
  const a = how === 'transition' ? fresh : { at: Math.round(now - random(rng) * 60 * DAY), fh: Math.max(c.fh, Math.round(fh - random(rng) * p.aFh * 0.9)) };
  return { fh, a, c: c.at < d.at ? d : c, d };
}

/**
 * Reserves the lessor already holds when a lease starts (USD): the lessor's share of the next heavy checks for the
 * time the aircraft flew before this lease ("lessor contribution").
 */
function startReserves(type: AircraftType, m: MaintState, now: SimTime): number {
  const p = PROGRAMME[type.category];
  const age = Math.max(0, (now - m.d.at) / YEAR_MIN);
  return Math.round(checkQuote(type, 'D', 10).usd * priceLevelAt(now) * Math.min(1, age / p.dYears));
}

/** Gives an aircraft its maintenance state when it enters service (and leases their reserve rate). */
export function ensureMaint(state: GameState, a: Aircraft): MaintState {
  const type = getAircraftType(a.typeId);
  if (!a.maint) {
    const how = a.owned && a.builtYear >= yearOf(state.time) - 1 && !a.lease ? 'new' : a.lease ? 'transition' : 'used';
    a.maint = initialMaint(a.id, type, a.builtYear, state.time, how);
  }
  if (a.lease && a.lease.reserveUsdPerFh === undefined) {
    a.lease.reserveUsdPerFh = reserveRateUsd(type) * priceLevelAt(state.time);
    a.maint.reserves ??= startReserves(type, a.maint, state.time);
  }
  return a.maint;
}

// ─── When are checks due? ──────────────────────────────────────────────────────

/** Flight hours an aircraft flies on an average day with its timetable. */
export function dailyFlightHours(state: GameState, world: EngineWorld, a: Aircraft): number {
  let minutes = 0;
  for (const pair of pairsOfAircraft(state, a.id)) {
    const route = state.routes[pair.routeId];
    if (!route) continue;
    const { out, back } = pairBlocks(world, a.typeId, route);
    for (let d = 0; d < 7; d++) if (hasDay(pair.days, d)) minutes += out + back;
  }
  return minutes / 60 / 7;
}

export interface CheckDue {
  /** Flight hours left until the next A-check. */
  aHoursLeft: number;
  /** Dates the C- and D-checks are due (C: whatever comes first, months or flight hours at today's flying). */
  c: SimTime;
  d: SimTime;
  /** The next heavy check (a D-check includes the C-check, so a C due shortly before a D waits for it). */
  next: { kind: HeavyCheck; due: SimTime };
}

export function checksDue(type: AircraftType, m: MaintState, now: SimTime, fhPerDay: number): CheckDue {
  const p = PROGRAMME[type.category];
  const cLeft = p.cFh - (m.fh - m.c.fh);
  const cByHours = fhPerDay > 0 ? now + Math.max(0, cLeft / fhPerDay) * DAY : Infinity;
  const c = Math.min(addMonths(m.c.at, p.cMonths), cByHours);
  const d = addMonths(m.d.at, p.dYears * 12);
  const next = d <= c + 180 * DAY ? { kind: 'D' as const, due: Math.min(c, d) } : { kind: 'C' as const, due: c };
  return { aHoursLeft: p.aFh - (m.fh - m.a.fh), c, d, next };
}

export const dueOf = (state: GameState, world: EngineWorld, a: Aircraft): CheckDue | null =>
  a.maint ? checksDue(getAircraftType(a.typeId), a.maint, state.time, dailyFlightHours(state, world, a)) : null;

/** Longest stay at the hub in the aircraft's week (minutes), e.g. the night between the last and the first flight. */
export function longestHubStayMin(state: GameState, world: EngineWorld, a: Aircraft): number {
  const busy: [number, number][] = [];
  for (const pair of pairsOfAircraft(state, a.id)) {
    const route = state.routes[pair.routeId];
    if (route) busy.push(...busyIntervals(world, a.typeId, route, pair));
  }
  if (!busy.length) return MINUTES_PER_WEEK;
  busy.sort((x, y) => x[0] - y[0]);
  let longest = 0;
  let end = busy[0]![1];
  for (const [s, e] of busy.slice(1)) {
    longest = Math.max(longest, s - end);
    end = Math.max(end, e);
  }
  // Across the end of the week back to Monday.
  return Math.max(longest, busy[0]![0] + MINUTES_PER_WEEK - end);
}

// ─── Prices ────────────────────────────────────────────────────────────────────

/** A ready own hangar at the hub with a free bay for this aircraft. */
function freeHangar(state: GameState, a: Aircraft, heavy: boolean): Hangar | undefined {
  const airline = state.airlines[a.airlineId];
  const category = getAircraftType(a.typeId).category;
  const hangars = Object.values(state.hangars).filter((h) => h.airlineId === a.airlineId && h.airportId === airline?.hubId && h.ready && fitsHangar(h.size, category));
  if (!heavy) return hangars[0];
  const used = Object.values(state.aircraft).filter((x) => x.airlineId === a.airlineId && x.maint?.inCheck && x.maint.inCheck.kind !== 'A' && x.maint.inCheck.where === 'hangar' && x.maint.inCheck.until > state.time).length;
  const bays = hangars.reduce((s, h) => s + HANGARS[h.size].bays, 0);
  return used < bays ? hangars[0] : undefined;
}

export interface CheckOffer {
  kind: 'A' | HeavyCheck;
  usd: number;
  days: number;
  where: 'mro' | 'hangar';
  shortNotice: boolean;
  /** Leased aircraft: what the lessor pays from the reserves (USD). */
  fromReserves: number;
}

/** What a check starting at `start`, booked at `bookedAt`, will cost and take. */
export function checkOffer(state: GameState, a: Aircraft, kind: 'A' | HeavyCheck, start: SimTime, bookedAt: SimTime): CheckOffer {
  const type = getAircraftType(a.typeId);
  const q = checkQuote(type, kind, ageOf(a, start));
  const where = freeHangar(state, a, kind !== 'A') ? 'hangar' : 'mro';
  const shortNotice = where === 'mro' && kind !== 'A' && start - bookedAt < SHORT_NOTICE_DAYS * DAY;
  // Prices of the time in historical games (the quote is in today's dollars).
  const usd = Math.round(q.usd * priceLevelAt(start) * (where === 'hangar' ? OWN_HANGAR_PRICE_SHARE : 1) * (shortNotice ? 1 + SHORT_NOTICE_PREMIUM : 1));
  const fromReserves = a.lease && kind !== 'A' ? Math.min(usd, a.maint?.reserves ?? 0) : 0;
  return { kind, usd, days: q.days, where, shortNotice, fromReserves };
}

// ─── Planning heavy checks ─────────────────────────────────────────────────────

/** Low season at the hub (northern winter, or southern winter for hubs south of the equator). */
function lowSeason(world: EngineWorld, state: GameState, a: Aircraft, time: SimTime): boolean {
  const hub = world.airportById.get(state.airlines[a.airlineId]?.hubId ?? '');
  const month = toDate(time).getUTCMonth() + 1;
  return (hub?.lat ?? 1) >= 0 ? month >= 11 || month <= 3 : month >= 5 && month <= 9;
}

/** The game's choice of start day: the latest low-season day before it is due, else a week before it is due. */
function autoStart(world: EngineWorld, state: GameState, a: Aircraft, due: SimTime): SimTime {
  const earliest = startOfDay(state.time) + DAY;
  const latest = Math.max(earliest, startOfDay(due) - 7 * DAY);
  for (let day = latest; day >= Math.max(earliest + SHORT_NOTICE_DAYS * DAY, latest - PLAN_AHEAD_DAYS * DAY); day -= DAY) {
    if (lowSeason(world, state, a, day)) return day;
  }
  return Math.max(earliest + Math.min(SHORT_NOTICE_DAYS, Math.max(0, (latest - earliest) / DAY)) * DAY, earliest);
}

export type MaintError = 'aircraftUnknown' | 'notActive' | 'noCheckDue' | 'dateInvalid' | 'inCheck' | 'airlineUnknown' | 'insufficientCash' | 'hangarExists';

type Result = { ok: true; id: string } | { ok: false; error: MaintError };

/** The player moves the next heavy check (or plans it early): from tomorrow until the day it is due. */
export function moveCheck(state: GameState, world: EngineWorld, airlineId: string, aircraftId: string, start: SimTime): Result {
  const a = state.aircraft[aircraftId];
  if (!a || a.airlineId !== airlineId) return { ok: false, error: 'aircraftUnknown' };
  if (a.status !== 'active') return { ok: false, error: 'notActive' };
  const m = ensureMaint(state, a);
  if (m.inCheck && m.inCheck.kind !== 'A' && m.inCheck.until > state.time) return { ok: false, error: 'inCheck' };
  const due = dueOf(state, world, a)!;
  const day = startOfDay(start);
  if (!Number.isFinite(day) || day < startOfDay(state.time) + DAY || day > due.next.due) return { ok: false, error: 'dateInvalid' };
  m.plan = { kind: due.next.kind, start: day, bookedAt: state.time, moved: true };
  return { ok: true, id: a.id };
}

// ─── Doing checks ──────────────────────────────────────────────────────────────

function startCheck(state: GameState, a: Aircraft, kind: 'A' | HeavyCheck, bookedAt: SimTime): void {
  const airline = state.airlines[a.airlineId];
  const m = a.maint!;
  if (!airline) return;
  const offer = checkOffer(state, a, kind, state.time, bookedAt);
  m.reserves = (m.reserves ?? 0) - offer.fromReserves;
  const paidUsd = offer.usd - offer.fromReserves;
  const paid = paidUsd > 0 ? -book(state, a.airlineId, 'check', money(-paidUsd, 'USD'), a.id).amount : 0;
  if (kind === 'A') {
    // Light checks are an expense of the day.
    bookPnl(state, a.airlineId, 'maintenance', paid);
  } else {
    // Heavy checks are written off until the same check is due again (or the lease ends), with what is left of the last.
    const p = PROGRAMME[getAircraftType(a.typeId).category];
    const today = startOfDay(state.time);
    const left = m.amort && m.amort.until > today ? (m.amort.perDay * (m.amort.until - today)) / DAY : 0;
    const until = Math.min(a.lease?.endAt ?? Infinity, addMonths(today, kind === 'C' ? p.cMonths : p.dYears * 12));
    m.amort = { perDay: (paid + left) / Math.max(1, (until - today) / DAY), until };
  }
  m.inCheck = { kind, until: startOfDay(state.time) + offer.days * DAY, where: offer.where };
  // A repaint waiting for this hangar visit is done at the same time.
  if (kind !== 'A') repaintWithCheck(state, a);
  delete m.plan;
  schedule(state, { at: m.inCheck.until, kind: 'checkDone', aircraftId: a.id });
  if (kind !== 'A') {
    postMessage(state, {
      airlineId: a.airlineId,
      kind: 'checkStarted',
      level: 'caution',
      params: {
        registration: a.registration, check: kind, days: offer.days, until: m.inCheck.until, where: offer.where,
        amount: Math.round(paid), currency: airline.currency, reserves: Math.round(usdToBook(state, offer.fromReserves, airline.currency)),
      },
    });
  }
}

/** A check is finished: the aircraft is back in service. A D-check includes a C-check, both include an A-check. */
export function finishCheck(state: GameState, aircraftId: string): void {
  const a = state.aircraft[aircraftId];
  const m = a?.maint;
  if (!a || !m?.inCheck || m.inCheck.until > state.time) return;
  const done: CheckRecord = { at: state.time, fh: m.fh };
  const kind = m.inCheck.kind;
  m.a = done;
  if (kind !== 'A') m.c = done;
  if (kind === 'D') m.d = done;
  delete m.inCheck;
  postMessage(state, { airlineId: a.airlineId, kind: 'checkDone', level: 'normal', params: { registration: a.registration, check: kind } });
}

/** A-check now: overnight at the hub if the aircraft stays there long enough, else it loses a day. */
function aCheck(state: GameState, world: EngineWorld, a: Aircraft): void {
  const p = PROGRAMME[getAircraftType(a.typeId).category];
  const m = a.maint!;
  if (longestHubStayMin(state, world, a) >= p.aHours * 60) {
    const offer = checkOffer(state, a, 'A', state.time, state.time);
    const paid = -book(state, a.airlineId, 'check', money(-offer.usd, 'USD'), a.id).amount;
    bookPnl(state, a.airlineId, 'maintenance', paid);
    m.a = { at: state.time, fh: m.fh };
  } else {
    startCheck(state, a, 'A', state.time);
    postMessage(state, { airlineId: a.airlineId, kind: 'aCheckGrounded', level: 'caution', params: { registration: a.registration, hours: p.aHours } });
  }
}

// ─── The daily step ────────────────────────────────────────────────────────────

/** Flight hours flown on the UTC day starting at `day` (flights cancelled by checks or failures don't count). */
function hoursFlownOn(state: GameState, world: EngineWorld, a: Aircraft, day: SimTime): number {
  if (grounded(a, day + DAY - 1)) return 0;
  let minutes = 0;
  for (const pair of pairsOfAircraft(state, a.id)) {
    const route = state.routes[pair.routeId];
    if (!route || pairDepartureUtc(world, route, pair, day) === null || aogCancels(world, route, pair, a, day)) continue;
    const { out, back } = pairBlocks(world, a.typeId, route);
    minutes += out + back;
  }
  return minutes / 60;
}

/**
 * Called at 00:00 UTC after the day's accounts: counts yesterday's flight hours, pays reserves and hangars, writes off
 * heavy checks, does due A-checks, plans and starts heavy checks, and decides today's technical failures.
 */
export function maintenanceDailyStep(state: GameState, world: EngineWorld): void {
  const yesterday = state.time - DAY;
  for (const a of Object.values(state.aircraft)) {
    const airline = state.airlines[a.airlineId];
    if (a.status !== 'active' || !airline) continue;
    const m = ensureMaint(state, a);
    const type = getAircraftType(a.typeId);

    const flown = hoursFlownOn(state, world, a, yesterday);
    m.fh += flown;
    // Reserves to the lessor (cash every day, like the fuel bill).
    if (a.lease && flown > 0) {
      const usd = flown * (a.lease.reserveUsdPerFh ?? 0);
      m.reserves = (m.reserves ?? 0) + usd;
      pay(state, a.airlineId, 'maintenance', usdToBook(state, usd, airline.currency));
    }
    if (m.amort && m.amort.until > yesterday) bookPnl(state, a.airlineId, 'maintenance', m.amort.perDay);
    if (m.aog && m.aog.until <= state.time) delete m.aog;
    if (m.inCheck && m.inCheck.until <= state.time) finishCheck(state, a.id);
    if (m.inCheck) continue;

    const due = checksDue(type, m, state.time, dailyFlightHours(state, world, a));
    // Heavy checks: planned by the game, moved earlier if more flying brings the due date forward.
    if (!m.plan && due.next.due - state.time <= PLAN_AHEAD_DAYS * DAY) {
      m.plan = { kind: due.next.kind, start: autoStart(world, state, a, due.next.due), bookedAt: state.time };
      postMessage(state, { airlineId: a.airlineId, kind: 'checkPlanned', level: 'info', params: { registration: a.registration, check: m.plan.kind, start: m.plan.start, due: due.next.due } });
    } else if (m.plan) {
      m.plan.kind = due.next.kind;
      if (m.plan.start > due.next.due) {
        m.plan = { ...m.plan, start: Math.max(startOfDay(state.time), startOfDay(due.next.due)), bookedAt: state.time };
        postMessage(state, { airlineId: a.airlineId, kind: 'checkMoved', level: 'caution', params: { registration: a.registration, check: m.plan.kind, start: m.plan.start } });
      }
    }
    if (m.plan && m.plan.start <= state.time) {
      startCheck(state, a, m.plan.kind, m.plan.bookedAt);
      continue;
    }
    const p = PROGRAMME[type.category];
    if (due.aHoursLeft <= 0 || state.time - m.a.at >= p.aDays * DAY) {
      aCheck(state, world, a);
      if (m.inCheck) continue;
    }
    rollFailure(state, world, a);
  }
  hangarDailyStep(state);
}

/** Money that leaves every day without a ledger entry (like fuel): cash and a profit-and-loss line. */
function pay(state: GameState, airlineId: string, line: 'maintenance' | 'depreciation', amount: number): void {
  const airline = state.airlines[airlineId]!;
  bookPnl(state, airlineId, line, amount);
  if (line === 'depreciation') return;
  const wasPositive = airline.cash.amount >= 0;
  airline.cash = { amount: airline.cash.amount - Math.round(amount), currency: airline.currency };
  if (wasPositive && airline.cash.amount < 0) postMessage(state, { airlineId, kind: 'cashNegative', level: 'warning', params: {} });
}

// ─── Technical failures ────────────────────────────────────────────────────────

/** Maybe a failure today: it grounds the aircraft from one of today's departures for some hours or days. */
function rollFailure(state: GameState, world: EngineWorld, a: Aircraft): void {
  const m = a.maint!;
  if (m.aog || grounded(a, state.time)) return;
  const departures: SimTime[] = [];
  for (const pair of pairsOfAircraft(state, a.id)) {
    const route = state.routes[pair.routeId];
    const dep = route ? pairDepartureUtc(world, route, pair, state.time) : null;
    if (dep !== null && dep >= state.time) departures.push(dep);
  }
  if (!departures.length) return;
  const type = getAircraftType(a.typeId);
  const p = PROGRAMME[type.category];
  // How far into its check cycle the aircraft is (0 = just checked, 1 = due).
  const used = Math.max((m.fh - m.c.fh) / p.cFh, (state.time - m.c.at) / (p.cMonths * 30.4 * DAY));
  const q = failureChance(ageOf(a, state.time), used, yearOf(state.time) - type.eis < 3);
  if (random(state) >= 1 - (1 - q) ** (departures.length * 2)) return;
  const from = departures[Math.floor(random(state) * departures.length)]!;
  const hours = failureHours(random(state), random(state));
  m.aog = { from, until: from + Math.round(hours * 60), hours: Math.round(hours) };
  schedule(state, { at: from, kind: 'failure', aircraftId: a.id });
}

/** The failure happens: repair costs, cancelled flights, compensation and care, angry passengers. */
export function failureStarts(state: GameState, world: EngineWorld, aircraftId: string): void {
  const a = state.aircraft[aircraftId];
  const aog = a?.maint?.aog;
  const airline = a && state.airlines[a.airlineId];
  if (!a || !aog || aog.from !== state.time || !airline) return;
  const type = getAircraftType(a.typeId);
  const hub = world.airportById.get(airline.hubId);
  const euCarrier = EU261_COUNTRIES.has(hub?.country ?? '');
  const last = state.finance[airline.id]?.history.at(-1);
  const level = priceLevelAt(state.time);

  // The aircraft's flights departing while it is grounded.
  let cancelled = 0;
  let pax = 0;
  let eur = 0;
  const weekStart = startOfWeek(aog.from);
  // A pair whose outbound flight can't leave loses its return flight too (the same cancellation as in the timetable).
  for (const leg of weeklyLegs(state, world, a.id)) {
    const route = state.routes[leg.routeId];
    if (!route || leg.fromId !== route.originId) continue;
    for (let k = -1; k <= 2; k++) {
      const dep = weekStart + leg.dep + k * MINUTES_PER_WEEK;
      if (dep < aog.from || dep >= aog.until) continue;
      const stats = last?.routes[leg.routeId];
      const lf = stats && stats.seats > 0 ? stats.pax / stats.seats : 0.8;
      const people = Math.round(a.seats * Math.min(1, lf));
      for (const fromId of [route.originId, route.destinationId]) {
        const covered = euCarrier || EU261_COUNTRIES.has(world.airportById.get(fromId)?.country ?? '');
        cancelled++;
        pax += people;
        // EU 261 compensation exists since 17 February 2005; care (meals, hotels) was always paid.
        eur += people * (careEur(aog.hours) + (covered && aog.from >= EU261_FROM ? CLAIM_SHARE * eu261Eur(route.distanceKm) : 0)) * level;
      }
    }
  }
  const repairUsd = Math.round((REPAIR_USD[type.category] * (1 + aog.hours / 24) * level) / 100) * 100;
  const repair = -book(state, a.airlineId, 'repair', money(-repairUsd, 'USD'), a.id).amount;
  bookPnl(state, a.airlineId, 'maintenance', repair);
  const compensation = eur > 0 ? -book(state, a.airlineId, 'compensation', money(-Math.round(eur), 'EUR'), a.id).amount : 0;
  bookPnl(state, a.airlineId, 'disruption', compensation);
  // Stranded passengers rate the airline badly (the reputation counts them with last week's flyers).
  const rep = state.reputation[a.airlineId];
  if (rep && pax > 0) addExperience(rep, { Y: { pax, product: 0, age: 0, value: 0, crowd: 0, disruption: -40 * pax } });
  postMessage(state, {
    airlineId: a.airlineId,
    kind: 'failure',
    level: 'warning',
    params: {
      registration: a.registration, hours: aog.hours, until: aog.until, flights: cancelled, pax,
      amount: Math.round(repair + compensation), currency: airline.currency,
    },
  });
}

// ─── Own hangars ───────────────────────────────────────────────────────────────

export function buildHangar(state: GameState, airlineId: string, size: HangarSize): Result {
  const airline = state.airlines[airlineId];
  if (!airline || !(size in HANGARS)) return { ok: false, error: 'airlineUnknown' };
  if (Object.values(state.hangars).some((h) => h.airlineId === airlineId && h.size === size && !h.ready)) return { ok: false, error: 'hangarExists' };
  const usd = HANGARS[size].usd * priceLevelAt(state.time);
  const first = usdToBook(state, usd * HANGAR_FIRST_PAYMENT, airline.currency);
  if (airline.cash.amount < first) return { ok: false, error: 'insufficientCash' };
  const id = nextId(state, 'H');
  const paid = -book(state, airlineId, 'hangar', money(-usd * HANGAR_FIRST_PAYMENT, 'USD'), id).amount;
  const readyAt = startOfDay(addMonths(state.time, HANGAR_BUILD_MONTHS));
  state.hangars[id] = { id, airlineId, airportId: airline.hubId, size, price: paid, orderedAt: state.time, readyAt };
  schedule(state, { at: readyAt, kind: 'hangarReady', hangarId: id });
  postMessage(state, { airlineId, kind: 'hangarOrdered', level: 'info', params: { size, airport: airline.hubId, readyAt, amount: Math.round(paid), currency: airline.currency } });
  return { ok: true, id };
}

/** The hangar is finished: the rest of the price is paid and it is used from now on. */
export function hangarReady(state: GameState, hangarId: string): void {
  const h = state.hangars[hangarId];
  if (!h || h.ready || !state.airlines[h.airlineId]) return;
  const usd = HANGARS[h.size].usd * priceLevelAt(h.orderedAt) * (1 - HANGAR_FIRST_PAYMENT);
  h.price += -book(state, h.airlineId, 'hangar', money(-usd, 'USD'), h.id).amount;
  h.ready = true;
  postMessage(state, { airlineId: h.airlineId, kind: 'hangarReady', level: 'normal', params: { size: h.size, airport: h.airportId } });
}

/** Running costs and write-off of the airline's own hangars. */
function hangarDailyStep(state: GameState): void {
  for (const h of Object.values(state.hangars)) {
    const airline = state.airlines[h.airlineId];
    if (!h.ready || !airline) continue;
    pay(state, h.airlineId, 'maintenance', usdToBook(state, HANGARS[h.size].runningUsdPerDay * priceLevelAt(state.time), airline.currency));
    pay(state, h.airlineId, 'depreciation', h.price / (HANGAR_LIFE_YEARS * 365.25));
  }
}

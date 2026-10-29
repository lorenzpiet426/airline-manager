// Pilots and cabin crew (Phase 8.1). The player employs captains and first officers per base and licence family, and
// cabin crew per base. The timetable decides how many are needed (block hours × crew per flight ÷ hours a crew member
// flies a year, plus reserves); with too few, a share of the flights is cancelled (with EU 261 compensation — a crew
// shortage is the airline's own fault). Hiring takes weeks and the job market limits how many can be found each month
// (shortages and surpluses over the years); pilots without the rating for the family need a type rating, first
// officers can be upgraded to captain, pilots retrained to another family. Pay above the market hires faster and keeps
// people; below it they leave. The HR department can plan all this automatically.
import { getAircraftType, type AircraftType } from '../data/aircraft';
import {
  CABIN_HOURS_YEAR,
  CABIN_PER_PILOT,
  CABIN_TRAINING_USD,
  CABIN_TRAINING_WEEKS,
  CAPTAIN_PAY,
  CAPTAIN_SHARE,
  CREW_RESERVE,
  FIRST_OFFICER_PAY,
  HIRE_WEEKS,
  MONTHLY_ATTRITION,
  PILOT_HOURS_YEAR,
  pilotMarket,
  pilotsPerFlight,
  pilotsPerMonth,
  EMPLOYER_PULL,
  RATED_SHARE,
  ratingFamily,
  SEVERANCE_MONTHS,
  TYPE_RATING_USD,
  TYPE_RATING_WEEKS,
  UPGRADE_USD,
  UPGRADE_WEEKS,
} from '../data/crews';
import { CLAIM_SHARE, careEur, EU261_COUNTRIES, eu261Eur } from '../data/maintenance';
import { stationOf, stationsOf } from './bases';
import { premiumCrew } from './cabins';
import { book, postMessage } from './core';
import { bookPnl } from './fleet';
import { addExperience } from './reputation';
import { CABIN_CREW_COST_USD, PILOT_COST_USD, wageFactor } from './economics';
import { priceLevelAt } from './era';
import { money } from './money';
import { random } from './rng';
import { pairBlocks, pairDepartureUtc } from './schedule';
import type { Airline, AirlineCrew, CrewBatch, CrewRole, FlightPair, GameState, Route, StationCrew } from './state';
import { MINUTES_PER_DAY, startOfDay, toDate, type SimTime } from './time';
import { hasDay } from './timetable';
import type { EngineWorld } from './world';

const WEEK = 7 * MINUTES_PER_DAY;
/** Planned above the need for people leaving while new ones are hired and trained (a few months of turnover). */
const PLANNING_BUFFER = 0.04;
const planned = (n: number) => (n > 0 ? Math.ceil(n * (1 + PLANNING_BUFFER)) : 0);
const EU261_FROM_DAY = '2005-02-17';

/** Cabin crew on one flight (EU: one per 50 seats; long-haul service and premium cabins need more). */
export function cabinCrewPerFlight(type: AircraftType, seats: number, cabin?: Parameters<typeof premiumCrew>[1]): number {
  const wide = type.category === 'widebody';
  return Math.max(1, Math.ceil(seats / (wide ? 35 : 50))) + (cabin ? premiumCrew(type, cabin) : 0);
}

export interface PilotNeed {
  captains: number;
  firstOfficers: number;
  /** Long-haul family (pay and hours of long-haul pilots). */
  long: boolean;
}
export interface StationNeed {
  pilots: Map<string, PilotNeed>;
  cabin: number;
}

/** Crew the timetable needs at each station (only aircraft in service), per licence family. */
export function crewNeeds(state: GameState, airlineId: string, world: EngineWorld, includeDelivering = false): Map<string, StationNeed> {
  const airline = state.airlines[airlineId];
  const needs = new Map<string, StationNeed>();
  if (!airline) return needs;
  const hours = new Map<string, { capt: number; fo: number; cabin: number; long: boolean }>();
  for (const pair of Object.values(state.flights)) {
    if (pair.airlineId !== airlineId) continue;
    const route = state.routes[pair.routeId];
    const aircraft = state.aircraft[pair.aircraftId];
    if (!route || !aircraft || (aircraft.status !== 'active' && !(includeDelivering && aircraft.status === 'delivering'))) continue;
    const type = getAircraftType(aircraft.typeId);
    const { out, back } = pairBlocks(world, aircraft.typeId, route);
    const days = [0, 1, 2, 3, 4, 5, 6].filter((d) => hasDay(pair.days, d)).length;
    const key = `${stationOf(airline, aircraft)}|${ratingFamily(aircraft.typeId)}`;
    const h = hours.get(key) ?? hours.set(key, { capt: 0, fo: 0, cabin: 0, long: false }).get(key)!;
    for (const block of [out, back]) {
      const p = pilotsPerFlight(block);
      // One captain and a first officer; a relief crew of three adds a first officer, four a second captain.
      const captains = Math.floor(p / 2);
      h.capt += (block / 60) * captains * days;
      h.fo += (block / 60) * (p - captains) * days;
      h.cabin += (block / 60) * cabinCrewPerFlight(type, aircraft.seats, aircraft.cabin) * days;
    }
    if (type.category === 'widebody') h.long = true;
  }
  for (const [key, h] of hours) {
    const [station, family] = key.split('|') as [string, string];
    const n = needs.get(station) ?? needs.set(station, { pilots: new Map(), cabin: 0 }).get(station)!;
    const perYear = h.long ? PILOT_HOURS_YEAR.long : PILOT_HOURS_YEAR.short;
    const crew = (weekly: number, yearly: number) => Math.ceil(((weekly * 52) / yearly) * (1 + CREW_RESERVE));
    n.pilots.set(family, { captains: crew(h.capt, perYear), firstOfficers: crew(h.fo, perYear), long: h.long });
    n.cabin += (h.cabin * 52) / CABIN_HOURS_YEAR;
  }
  for (const n of needs.values()) n.cabin = Math.ceil(n.cabin * (1 + CREW_RESERVE));
  return needs;
}

const emptyStation = (): StationCrew => ({ pilots: {}, cabin: 0, pay: 1, pipeline: [] });

/** The airline's crew at a station (created when first needed). */
function stationCrew(crew: AirlineCrew, station: string): StationCrew {
  return (crew.stations[station] ??= emptyStation());
}

/** Old games, takeovers: the airline employs exactly the crews its timetable needs today (and plans automatically). */
export function ensureCrew(state: GameState, world: EngineWorld): void {
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || airline.crew) continue;
    airline.crew = { stations: {}, auto: true, hired: {} };
    for (const [station, need] of crewNeeds(state, airline.id, world)) {
      const s = stationCrew(airline.crew, station);
      for (const [family, p] of need.pilots) s.pilots[family] = { captains: planned(p.captains), firstOfficers: planned(p.firstOfficers) };
      s.cabin = planned(need.cabin);
    }
  }
}

/** Staff that come with flights taken over (a subsidiary joining): crews up to what the timetable needs, at once. */
export function grantCrewForNeeds(state: GameState, world: EngineWorld, airlineId: string): void {
  const airline = state.airlines[airlineId];
  if (!airline?.crew) return;
  for (const [station, need] of crewNeeds(state, airlineId, world)) {
    const s = stationCrew(airline.crew, station);
    for (const [family, p] of need.pilots) {
      const have = (s.pilots[family] ??= { captains: 0, firstOfficers: 0 });
      have.captains = Math.max(have.captains, planned(p.captains));
      have.firstOfficers = Math.max(have.firstOfficers, planned(p.firstOfficers));
    }
    s.cabin = Math.max(s.cabin, planned(need.cabin));
  }
}

/** How many of the flights of a station and family can't be crewed (0 = all can, 1 = none). */
export function crewShortages(state: GameState, world: EngineWorld, airlineId: string): Map<string, number> {
  const airline = state.airlines[airlineId];
  const result = new Map<string, number>();
  if (!airline?.crew) return result;
  for (const [station, need] of crewNeeds(state, airlineId, world)) {
    const s = airline.crew.stations[station] ?? emptyStation();
    const cabinRatio = need.cabin > 0 ? Math.min(1, s.cabin / need.cabin) : 1;
    for (const [family, p] of need.pilots) {
      const have = s.pilots[family] ?? { captains: 0, firstOfficers: 0 };
      // Captains can fly as first officers, not the other way round.
      const capt = p.captains > 0 ? have.captains / p.captains : 1;
      const all = p.captains + p.firstOfficers > 0 ? (have.captains + have.firstOfficers) / (p.captains + p.firstOfficers) : 1;
      const ratio = Math.min(1, capt, all, cabinRatio);
      if (ratio < 1) result.set(`${station}|${family}`, 1 - ratio);
    }
  }
  return result;
}

const shortageCache = new WeakMap<GameState, { key: string; shortages: Map<string, number> }>();
function shortagesToday(state: GameState, world: EngineWorld, airlineId: string): Map<string, number> {
  const crew = state.airlines[airlineId]?.crew;
  const key = `${airlineId}#${Math.floor(state.time / MINUTES_PER_DAY)}#${Object.keys(state.flights).length}#${JSON.stringify(crew?.stations ?? {}).length}`;
  const hit = shortageCache.get(state);
  if (hit?.key === key) return hit.shortages;
  const shortages = crewShortages(state, world, airlineId);
  shortageCache.set(state, { key, shortages });
  return shortages;
}

/** Is this pair cancelled on the day of `time` for want of crew? (a stable share of the station's flights of that family) */
export function crewCancelsPair(state: GameState, world: EngineWorld, route: Route, pair: FlightPair, time: SimTime): boolean {
  const airline = state.airlines[route.airlineId];
  const aircraft = state.aircraft[pair.aircraftId];
  if (!airline?.crew || !aircraft) return false;
  const share = shortagesToday(state, world, airline.id).get(`${stationOf(airline, aircraft)}|${ratingFamily(aircraft.typeId)}`) ?? 0;
  if (share <= 0) return false;
  let h = 2166136261;
  for (const ch of `${pair.id}|${startOfDay(time)}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296 < share;
}

// ─── Pay ───────────────────────────────────────────────────────────────────────

const familyIsLong = (state: GameState, airlineId: string, family: string): boolean =>
  Object.values(state.aircraft).some((a) => a.airlineId === airlineId && ratingFamily(a.typeId) === family && getAircraftType(a.typeId).category === 'widebody');

/** Yearly pay of one crew member (USD of 2025, before the base country's wage level and the base's pay level). */
function yearlyPayUsd(role: CrewRole, long: boolean): number {
  const pilot = long ? PILOT_COST_USD.long : PILOT_COST_USD.short;
  return role === 'captain' ? pilot * CAPTAIN_PAY : role === 'firstOfficer' ? pilot * FIRST_OFFICER_PAY : CABIN_CREW_COST_USD;
}

/** Salaries of all crews per day (USD; × the cost level of the year by the caller), incl. those still in training. */
export function crewPayPerDayUsd(state: GameState, world: EngineWorld, airline: Airline): number {
  let total = 0;
  for (const [station, s] of Object.entries(airline.crew?.stations ?? {})) {
    const country = world.airportById.get(station)?.country ?? world.airportById.get(airline.hubId)?.country ?? 'AT';
    const wage = wageFactor(world, country) * s.pay;
    let yearly = s.cabin * yearlyPayUsd('cabin', false);
    for (const [family, p] of Object.entries(s.pilots)) {
      const long = familyIsLong(state, airline.id, family);
      yearly += p.captains * yearlyPayUsd('captain', long) + p.firstOfficers * yearlyPayUsd('firstOfficer', long);
    }
    for (const b of s.pipeline) yearly += b.count * yearlyPayUsd(b.role, b.family ? familyIsLong(state, airline.id, b.family) : false);
    total += (yearly * wage) / 365;
  }
  return total;
}

// ─── The job market ──────────────────────────────────────────────────────────────

const monthKey = (time: SimTime) => toDate(time).toISOString().slice(0, 7);

/** Hires still possible this month at a station: pilots (of them captains) and cabin crew. */
export function hiringQuota(state: GameState, world: EngineWorld, airline: Airline, station: string): { pilots: number; captains: number; rated: number; cabin: number } {
  const s = airline.crew?.stations[station];
  const pay = s?.pay ?? 1;
  const airport = world.airportById.get(station);
  // Big employers attract more applicants and train their own (cadet programmes): about 1 % of their pilots a month more.
  const employed = Object.values(s?.pilots ?? {}).reduce((n, p) => n + p.captains + p.firstOfficers, 0);
  const base = (pilotsPerMonth(airport?.marketPop ?? 1_000_000) + employed * EMPLOYER_PULL) * pilotMarket(toDate(state.time).getUTCFullYear()) * pay ** 2;
  const done = airline.crew?.hired[station];
  const used = done && done.month === monthKey(state.time) ? done : { pilots: 0, cabin: 0, captains: 0, rated: 0 };
  return {
    pilots: Math.max(0, Math.floor(base) - used.pilots),
    captains: Math.max(0, Math.floor(base * CAPTAIN_SHARE) - (used.captains ?? 0)),
    rated: Math.max(0, Math.floor(base * RATED_SHARE) - (used.rated ?? 0)),
    cabin: Math.max(0, Math.floor(base * CABIN_PER_PILOT) - used.cabin),
  };
}

export type CrewError = 'crewInvalid' | 'noCandidates' | 'notEnoughCrew' | 'insufficientCash' | 'baseUnknown';

/** Training and severance: paid now, part of the crew costs of the period. */
const trainingCost = (state: GameState, airline: Airline, usd: number) => {
  if (usd <= 0) return;
  const paid = -book(state, airline.id, 'training', money(-Math.round(usd * priceLevelAt(state.time)), 'USD')).amount;
  bookPnl(state, airline.id, 'crew', paid);
};

/** Hiring from the job market (rated pilots start sooner; the others need a type rating first). */
export function hireCrew(state: GameState, world: EngineWorld, airlineId: string, station: string, role: CrewRole, family: string | null, count: number): CrewError | null {
  const airline = state.airlines[airlineId]!;
  if (!stationsOf(airline).includes(station)) return 'baseUnknown';
  if (!Number.isInteger(count) || count < 1 || (role !== 'cabin' && !family)) return 'crewInvalid';
  airline.crew ??= { stations: {}, auto: true, hired: {} };
  const quota = hiringQuota(state, world, airline, station);
  const limit = role === 'cabin' ? quota.cabin : role === 'captain' ? Math.min(quota.pilots, quota.captains) : quota.pilots;
  if (count > limit) return 'noCandidates';
  const s = stationCrew(airline.crew, station);
  const month = monthKey(state.time);
  const done = (airline.crew.hired[station] = airline.crew.hired[station]?.month === month ? airline.crew.hired[station]! : { month, pilots: 0, cabin: 0, captains: 0, rated: 0 });
  if (role === 'cabin') {
    s.pipeline.push({ role, family: null, count, readyAt: state.time + (HIRE_WEEKS + CABIN_TRAINING_WEEKS) * WEEK, source: 'hire' });
    done.cabin += count;
    trainingCost(state, airline, count * CABIN_TRAINING_USD);
    return null;
  }
  const rated = Math.min(count, quota.rated);
  if (rated) s.pipeline.push({ role, family, count: rated, readyAt: state.time + HIRE_WEEKS * WEEK, source: 'hire' });
  if (count > rated) s.pipeline.push({ role, family, count: count - rated, readyAt: state.time + (HIRE_WEEKS + TYPE_RATING_WEEKS) * WEEK, source: 'rating' });
  done.pilots += count;
  done.rated += rated;
  if (role === 'captain') done.captains += count;
  trainingCost(state, airline, (count - rated) * TYPE_RATING_USD);
  return null;
}

/** Command upgrade (first officers → captains) or a type rating for another family (pilots move to it). */
export function trainCrew(
  state: GameState,
  airlineId: string,
  station: string,
  kind: 'upgrade' | 'rating',
  family: string,
  count: number,
  from?: { family: string; role: 'captain' | 'firstOfficer' },
): CrewError | null {
  const airline = state.airlines[airlineId]!;
  const s = airline.crew?.stations[station];
  if (!s || !Number.isInteger(count) || count < 1) return 'crewInvalid';
  if (kind === 'upgrade') {
    const p = s.pilots[family];
    if (!p || p.firstOfficers < count) return 'notEnoughCrew';
    p.firstOfficers -= count;
    s.pipeline.push({ role: 'captain', family, count, readyAt: state.time + UPGRADE_WEEKS * WEEK, source: 'upgrade' });
    trainingCost(state, airline, count * UPGRADE_USD);
    return null;
  }
  if (!from || from.family === family) return 'crewInvalid';
  const p = s.pilots[from.family];
  const have = p ? (from.role === 'captain' ? p.captains : p.firstOfficers) : 0;
  if (!p || have < count) return 'notEnoughCrew';
  if (from.role === 'captain') p.captains -= count;
  else p.firstOfficers -= count;
  s.pipeline.push({ role: from.role, family, count, readyAt: state.time + TYPE_RATING_WEEKS * WEEK, source: 'rating' });
  trainingCost(state, airline, count * TYPE_RATING_USD);
  return null;
}

/** Letting crew go (about three months' pay). */
export function releaseCrew(state: GameState, world: EngineWorld, airlineId: string, station: string, role: CrewRole, family: string | null, count: number): CrewError | null {
  const airline = state.airlines[airlineId]!;
  const s = airline.crew?.stations[station];
  if (!s || !Number.isInteger(count) || count < 1) return 'crewInvalid';
  const country = world.airportById.get(station)?.country ?? 'AT';
  if (role === 'cabin') {
    if (s.cabin < count) return 'notEnoughCrew';
    s.cabin -= count;
  } else {
    const p = family ? s.pilots[family] : undefined;
    const have = p ? (role === 'captain' ? p.captains : p.firstOfficers) : 0;
    if (!p || have < count) return 'notEnoughCrew';
    if (role === 'captain') p.captains -= count;
    else p.firstOfficers -= count;
  }
  const long = family ? familyIsLong(state, airlineId, family) : false;
  trainingCost(state, airline, ((count * yearlyPayUsd(role, long) * wageFactor(world, country) * s.pay) / 12) * SEVERANCE_MONTHS);
  return null;
}

export function setCrewPay(state: GameState, airlineId: string, station: string, pay: number): CrewError | null {
  const airline = state.airlines[airlineId]!;
  if (!Number.isFinite(pay) || pay < 0.8 || pay > 1.3) return 'crewInvalid';
  if (!stationsOf(airline).includes(station)) return 'baseUnknown';
  airline.crew ??= { stations: {}, auto: true, hired: {} };
  stationCrew(airline.crew, station).pay = Math.round(pay * 100) / 100;
  return null;
}

// ─── Automatic planning (the HR department) ─────────────────────────────────────

/**
 * Plans crews for today's timetable and the aircraft about to arrive: retrains pilots of families with too many,
 * upgrades first officers where captains are missing, and hires the rest as far as the market allows.
 */
export function planCrew(state: GameState, world: EngineWorld, airlineId: string): void {
  const airline = state.airlines[airlineId];
  if (!airline?.crew) return;
  for (const [station, need] of crewNeeds(state, airlineId, world, true)) {
    const s = stationCrew(airline.crew, station);
    const coming = (role: CrewRole, family: string | null) => s.pipeline.filter((b) => b.role === role && b.family === family).reduce((n, b) => n + b.count, 0);
    // Cabin crew.
    const cabinShort = planned(need.cabin) - s.cabin - coming('cabin', null);
    if (cabinShort > 0) {
      const q = hiringQuota(state, world, airline, station).cabin;
      if (q > 0) hireCrew(state, world, airlineId, station, 'cabin', null, Math.min(cabinShort, q));
    }
    for (const [family, p] of need.pilots) {
      const have = (s.pilots[family] ??= { captains: 0, firstOfficers: 0 });
      let captShort = planned(p.captains) - have.captains - coming('captain', family);
      let foShort = planned(p.firstOfficers) - have.firstOfficers - coming('firstOfficer', family);
      // Pilots of families the station no longer needs as many of: retrain them.
      for (const [other, op] of Object.entries(s.pilots)) {
        if (other === family) continue;
        const otherNeed = need.pilots.get(other) ?? { captains: 0, firstOfficers: 0 };
        const spareCapt = Math.max(0, op.captains - planned(otherNeed.captains));
        const spareFo = Math.max(0, op.firstOfficers - planned(otherNeed.firstOfficers));
        const c = Math.min(spareCapt, Math.max(0, captShort));
        if (c > 0 && !trainCrew(state, airlineId, station, 'rating', family, c, { family: other, role: 'captain' })) captShort -= c;
        const f = Math.min(spareFo, Math.max(0, foShort));
        if (f > 0 && !trainCrew(state, airlineId, station, 'rating', family, f, { family: other, role: 'firstOfficer' })) foShort -= f;
      }
      // Captains from the market are scarce: upgrade first officers and hire first officers instead.
      if (captShort > 0) {
        const q = hiringQuota(state, world, airline, station);
        const direct = Math.min(captShort, q.captains, q.pilots);
        if (direct > 0 && !hireCrew(state, world, airlineId, station, 'captain', family, direct)) captShort -= direct;
        const up = Math.min(captShort, have.firstOfficers);
        if (up > 0 && !trainCrew(state, airlineId, station, 'upgrade', family, up)) {
          captShort -= up;
          foShort += up;
        }
      }
      if (foShort > 0) {
        const q = hiringQuota(state, world, airline, station).pilots;
        const n = Math.min(foShort, q);
        if (n > 0) hireCrew(state, world, airlineId, station, 'firstOfficer', family, n);
      }
    }
  }
}

// ─── Daily step ──────────────────────────────────────────────────────────────────

/** 00:00 UTC: trained and hired crews start, people leave (1st of the month), planning (Mondays), yesterday's
 * cancellations for want of crew are paid for. */
export function crewDailyStep(state: GameState, world: EngineWorld): void {
  const date = toDate(state.time);
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || !airline.crew) continue;
    for (const [station, s] of Object.entries(airline.crew.stations)) {
      const ready = s.pipeline.filter((b) => b.readyAt <= state.time);
      if (!ready.length) continue;
      s.pipeline = s.pipeline.filter((b) => b.readyAt > state.time);
      for (const b of ready) {
        if (b.role === 'cabin') s.cabin += b.count;
        else {
          const p = (s.pilots[b.family!] ??= { captains: 0, firstOfficers: 0 });
          if (b.role === 'captain') p.captains += b.count;
          else p.firstOfficers += b.count;
        }
      }
      postMessage(state, { airlineId: airline.id, kind: 'crewReady', level: 'info', params: { airport: world.airportById.get(station)?.iata ?? station, count: ready.reduce((n, b) => n + b.count, 0) } });
    }
    if (date.getUTCDate() === 1) attrition(state, airline);
    if (date.getUTCDay() === 1 && airline.crew.auto) planCrew(state, world, airline.id);
    bookCrewCancellations(state, world, airline);
  }
}

/** People leave: more when pay is below the market and when other airlines are hiring (shortage). */
function attrition(state: GameState, airline: Airline): void {
  const market = pilotMarket(toDate(state.time).getUTCFullYear());
  let left = 0;
  for (const s of Object.values(airline.crew!.stations)) {
    const rate = MONTHLY_ATTRITION * (2 - s.pay) ** 3 * Math.min(3, 1 / market);
    const leave = (n: number) => {
      const exact = n * rate;
      const k = Math.floor(exact) + (random(state) < exact - Math.floor(exact) ? 1 : 0);
      left += k;
      return n - k;
    };
    s.cabin = leave(s.cabin);
    for (const p of Object.values(s.pilots)) {
      p.captains = leave(p.captains);
      p.firstOfficers = leave(p.firstOfficers);
    }
  }
  if (left) postMessage(state, { airlineId: airline.id, kind: 'crewLeft', level: 'caution', params: { count: left } });
}

/** Yesterday's flights cancelled for want of crew: care and EU 261 compensation (not extraordinary). */
function bookCrewCancellations(state: GameState, world: EngineWorld, airline: Airline): void {
  const day = state.time - MINUTES_PER_DAY;
  const last = state.finance[airline.id]?.history.at(-1);
  let flights = 0;
  let eur = 0;
  let pax = 0;
  const hub = world.airportById.get(airline.hubId);
  const euCarrier = EU261_COUNTRIES.has(hub?.country ?? '');
  for (const pair of Object.values(state.flights)) {
    if (pair.airlineId !== airline.id) continue;
    const route = state.routes[pair.routeId];
    const aircraft = state.aircraft[pair.aircraftId];
    if (!route || !aircraft || aircraft.status !== 'active') continue;
    if (pairDepartureUtc(world, route, pair, day) === null || !crewCancelsPair(state, world, route, pair, day)) continue;
    const stats = last?.routes[route.id];
    const lf = stats && stats.seats > 0 ? stats.pax / stats.seats : 0.8;
    const people = 2 * Math.round(aircraft.seats * Math.min(1, lf));
    const covered = euCarrier || EU261_COUNTRIES.has(world.airportById.get(route.originId)?.country ?? '');
    const comp = covered && toDate(day).toISOString().slice(0, 10) >= EU261_FROM_DAY ? CLAIM_SHARE * eu261Eur(route.distanceKm) : 0;
    eur += people * (careEur(4) + comp);
    pax += people;
    flights += 2;
  }
  if (!flights) return;
  const cost = -book(state, airline.id, 'compensation', money(-Math.round(eur * priceLevelAt(state.time)), 'EUR')).amount;
  bookPnl(state, airline.id, 'disruption', cost);
  // Stranded passengers rate the airline badly (as after a technical failure).
  const rep = state.reputation[airline.id];
  if (rep && pax > 0) addExperience(rep, { Y: { pax, product: 0, age: 0, value: 0, crowd: 0, disruption: -40 * pax } });
  postMessage(state, { airlineId: airline.id, kind: 'crewCancellations', level: 'warning', params: { count: flights } });
}

/** People employed and in training (for the screens). */
export function crewTotals(airline: Airline): { pilots: number; cabin: number; training: number } {
  let pilots = 0;
  let cabin = 0;
  let training = 0;
  for (const s of Object.values(airline.crew?.stations ?? {})) {
    cabin += s.cabin;
    for (const p of Object.values(s.pilots)) pilots += p.captains + p.firstOfficers;
    training += s.pipeline.reduce((n, b: CrewBatch) => n + b.count, 0);
  }
  return { pilots, cabin, training };
}

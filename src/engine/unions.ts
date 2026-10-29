// Unions, wage talks and strikes (Phase 8.2). The airline's pilots and cabin crew in each country have a collective
// agreement with their union: it sets their pay (relative to the market) and forbids strikes while it runs. A few weeks
// before it ends the union opens talks with a demand built from inflation, the airline's profits, the job market and
// how far pay has fallen behind; the airline answers with offers every two weeks (the HR department makes a moderate
// one if the player doesn't). After the agreement has ended, a union that is still far apart may call warning strikes
// and strikes — how readily and with how much notice depends on the country (data/unions.ts). Mediation brings a
// proposal both sides can accept. Strikes cancel a share of the flights from the country's stations; since the SAS
// ruling (2021) passengers get EU 261 compensation unless told 14 days ahead.
import { CLAIM_SHARE, careEur, EU261_COUNTRIES, eu261Eur } from '../data/maintenance';
import { pilotMarket } from '../data/crews';
import {
  AGREEMENT_YEARS,
  inflationBefore,
  MEDIATION_WEEKS,
  NO_STRIKE_PERIODS,
  ROUND_WEEKS,
  STRIKE_COMPENSATION_FROM,
  STRIKE_PARTICIPATION,
  strikeCulture,
  TALKS_WEEKS_BEFORE,
  WARNING_SHARE,
  type UnionGroup,
} from '../data/unions';
import { stationOf, stationsOf } from './bases';
import { book, postMessage } from './core';
import { priceLevelAt } from './era';
import { bookPnl } from './fleet';
import { money } from './money';
import { addExperience } from './reputation';
import { random } from './rng';
import { pairDepartureUtc } from './schedule';
import { pnlCosts, type Agreement, type Airline, type FlightPair, type GameState, type Route } from './state';
import { addMonths, MINUTES_PER_DAY, startOfDay, toDate, type SimTime } from './time';
import type { EngineWorld } from './world';

const DAY = MINUTES_PER_DAY;
const WEEK = 7 * DAY;
const YEAR = 365 * DAY;
export const GROUPS: readonly UnionGroup[] = ['pilots', 'cabin'];

export const agreementKey = (country: string, group: UnionGroup) => `${country}|${group}`;
const countryOf = (world: EngineWorld, airportId: string) => world.airportById.get(airportId)?.country ?? '';
const yearOf = (time: SimTime) => toDate(time).getUTCFullYear();
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A stable number in [0, 1) from a text (no effect on the game's random numbers). */
function hash01(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Pay of a group at a station relative to the market: the agreement × the station's extra pay. */
export function groupPay(world: EngineWorld, airline: Airline, station: string, group: UnionGroup): number {
  const agreed = airline.labour?.[agreementKey(countryOf(world, station), group)]?.pay ?? 1;
  return agreed * (airline.crew?.stations[station]?.pay ?? 1);
}

/** The crews' mood for a station's group (0 without an agreement). */
export const groupMood = (world: EngineWorld, airline: Airline, station: string, group: UnionGroup): number =>
  airline.labour?.[agreementKey(countryOf(world, station), group)]?.mood ?? 0;

/**
 * Every country where the airline has crews gets agreements for pilots and cabin crew (new ones, or old games: running
 * for another 3–24 months; `until` overrides that per country, e.g. a taken-over airline's real agreement).
 */
export function ensureLabour(state: GameState, world: EngineWorld, until?: Record<string, SimTime>): void {
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || !airline.crew) continue;
    airline.labour ??= {};
    for (const s of Object.values(airline.crew.stations)) if (s.pay < 1) s.pay = 1;
    const countries = new Set(stationsOf(airline).map((id) => countryOf(world, id)).filter(Boolean));
    for (const country of countries) {
      for (const group of GROUPS) {
        const key = agreementKey(country, group);
        if (airline.labour[key]) continue;
        const months = 3 + Math.floor(hash01(`${airline.id}|${key}`) * 22);
        airline.labour[key] = { country, group, pay: 1, until: until?.[country] ?? addMonths(startOfDay(state.time), months), mood: 0, strikes: [] };
      }
    }
  }
}

// ─── Talks ───────────────────────────────────────────────────────────────────────

/** Result margin of the last 12 completed months (0 without history). */
function lastYearMargin(state: GameState, airlineId: string): number {
  const months = state.finance[airlineId]?.months.slice(-12) ?? [];
  const revenue = months.reduce((n, m) => n + m.lines.revenue, 0);
  const costs = months.reduce((n, m) => n + pnlCosts(m.lines), 0);
  return revenue > 0 ? (revenue - costs) / revenue : 0;
}

/** What the union asks for (a yearly raise) and the least it would sign. */
export function unionDemand(state: GameState, airline: Airline, a: Agreement): { demand: number; floor: number; inflation: number } {
  const year = yearOf(a.until);
  const inflation = inflationBefore(year);
  const culture = strikeCulture(a.country, year);
  const catchUp = Math.max(0, 1 - a.pay) / AGREEMENT_YEARS;
  const profit = clamp(lastYearMargin(state, airline.id) - 0.03, 0, 0.12) * 0.25;
  const market = a.group === 'pilots' ? Math.max(-0.015, (1 - pilotMarket(year)) * 0.04) : 0;
  const demand = round3(Math.max(0, inflation + catchUp + profit + market + culture.militancy * 0.008 - a.mood * 0.01));
  const firm = clamp(0.3 + 0.25 * culture.militancy, 0.3, 0.65);
  const floor = round3(Math.min(demand, inflation * 0.9 + Math.max(0, demand - inflation * 0.9) * firm));
  return { demand, floor, inflation };
}

function openTalks(state: GameState, airline: Airline, a: Agreement): void {
  const { demand, floor, inflation } = unionDemand(state, airline, a);
  a.talks = { opened: state.time, round: 0, demand, floor, inflation, nextRound: state.time };
  postMessage(state, { airlineId: airline.id, kind: 'talksOpened', level: 'caution', params: { country: a.country, group: a.group, demand: demand * 100, until: a.until } });
}

export type UnionError = 'noTalks' | 'offerTooSoon' | 'offerInvalid' | 'noProposal' | 'mediationBusy';

function sign(state: GameState, airline: Airline, a: Agreement, raise: number): void {
  const t = a.talks!;
  const factor = (1 + raise) / (1 + t.inflation);
  a.pay = round3(a.pay * factor);
  const start = Math.max(state.time, a.until);
  a.step = { at: start + YEAR, factor };
  a.until = start + AGREEMENT_YEARS * YEAR;
  const fair = (t.demand + t.floor) / 2;
  a.mood = round3(clamp(a.mood + 0.1 + clamp((raise - fair) * 8, -0.3, 0.3), -1, 1));
  a.talks = undefined;
  // Strikes not yet started are called off.
  a.strikes = a.strikes.filter((s) => s.from <= state.time);
  postMessage(state, { airlineId: airline.id, kind: 'agreementSigned', level: 'info', params: { country: a.country, group: a.group, raise: raise * 100, until: a.until } });
}

/** An offer (a yearly raise). The union signs if it reaches what it will accept, else it answers with a lower demand. */
export function offerWage(state: GameState, airlineId: string, key: string, raise: number, byHr = false): UnionError | null {
  const airline = state.airlines[airlineId]!;
  const a = airline.labour?.[key];
  const t = a?.talks;
  if (!a || !t) return 'noTalks';
  if (!Number.isFinite(raise) || raise < 0 || raise > 0.25) return 'offerInvalid';
  if (state.time < t.nextRound || t.mediationUntil !== undefined) return 'offerTooSoon';
  if (byHr) postMessage(state, { airlineId, kind: 'hrOffer', level: 'info', params: { country: a.country, group: a.group, offer: raise * 100 } });
  if (raise >= t.floor) {
    sign(state, airline, a, raise);
    return null;
  }
  const gap = (t.demand - raise) / Math.max(0.005, t.demand);
  // An offer below an earlier one, or far from the demand, angers the crews.
  a.mood = round3(clamp(a.mood - (raise < (t.offer ?? 0) ? 0.15 : gap > 0.6 ? 0.1 : 0.03), -1, 1));
  t.demand = round3(Math.max(t.floor, t.demand - (t.demand - raise) * 0.25));
  t.offer = Math.max(t.offer ?? 0, raise);
  t.round += 1;
  t.nextRound = state.time + ROUND_WEEKS * WEEK;
  postMessage(state, { airlineId, kind: 'unionAnswer', level: 'caution', params: { country: a.country, group: a.group, offer: raise * 100, demand: t.demand * 100 } });
  return null;
}

export function acceptDemand(state: GameState, airlineId: string, key: string): UnionError | null {
  const airline = state.airlines[airlineId]!;
  const a = airline.labour?.[key];
  if (!a?.talks) return 'noTalks';
  sign(state, airline, a, a.talks.demand);
  return null;
}

/** Mediation: three weeks of peace, then a proposal halfway between the demand and the best offer. */
export function callMediation(state: GameState, airlineId: string, key: string): UnionError | null {
  const a = state.airlines[airlineId]!.labour?.[key];
  const t = a?.talks;
  if (!a || !t) return 'noTalks';
  if (t.mediationUntil !== undefined) return 'mediationBusy';
  t.mediationUntil = state.time + MEDIATION_WEEKS * WEEK;
  a.strikes = a.strikes.filter((s) => s.from <= state.time);
  postMessage(state, { airlineId, kind: 'mediationStarted', level: 'info', params: { country: a.country, group: a.group, until: t.mediationUntil } });
  return null;
}

/** Answering the mediator's proposal; if the airline accepts, the union's members vote (most proposals pass). */
export function answerProposal(state: GameState, airlineId: string, key: string, accept: boolean): UnionError | null {
  const airline = state.airlines[airlineId]!;
  const a = airline.labour?.[key];
  const t = a?.talks;
  if (!a || !t || t.proposal === undefined) return 'noProposal';
  const proposal = t.proposal;
  t.mediationUntil = t.proposal = t.proposalUntil = undefined;
  if (accept && random(state) < 0.85) {
    sign(state, airline, a, proposal);
    return null;
  }
  if (accept) t.demand = round3((t.demand + proposal) / 2);
  else a.mood = round3(clamp(a.mood - 0.15, -1, 1));
  t.offer = Math.max(t.offer ?? 0, accept ? proposal : t.offer ?? 0);
  t.nextRound = state.time;
  postMessage(state, { airlineId, kind: 'mediationRejected', level: 'caution', params: { country: a.country, group: a.group, by: accept ? 'union' : 'airline' } });
  return null;
}

// ─── Strikes ─────────────────────────────────────────────────────────────────────

const inNoStrikePeriod = (country: string, time: SimTime) => {
  const md = toDate(time).toISOString().slice(5, 10);
  return (NO_STRIKE_PERIODS[country] ?? []).some(([from, to]) => md >= from && md <= to);
};

/** Weekly after the agreement has ended: the union may strike, more likely the further apart and the angrier. */
function maybeStrike(state: GameState, airline: Airline, a: Agreement): void {
  const t = a.talks!;
  if (state.time < a.until || t.mediationUntil !== undefined || a.strikes.some((s) => s.until > state.time)) return;
  const culture = strikeCulture(a.country, yearOf(state.time));
  const gap = clamp((t.demand - (t.offer ?? 0)) / Math.max(0.005, t.demand), 0, 1);
  if (random(state) >= culture.militancy * gap * (1 - a.mood * 0.5) * 0.6) return;
  const warning = culture.warning && !t.actions;
  const notice = Math.max(1, culture.noticeDays) * DAY;
  let from = startOfDay(state.time + notice);
  if (inNoStrikePeriod(a.country, from)) return;
  const days = warning ? 1 : 1 + Math.floor(random(state) * (a.group === 'pilots' ? 3 : 2));
  a.strikes.push({ from, until: from + days * DAY, announced: state.time, warning });
  t.actions = (t.actions ?? 0) + 1;
  // Strikes cost the strikers too: the union comes down a little.
  t.demand = round3(Math.max(t.floor, t.demand - (t.demand - (t.offer ?? 0)) * 0.1));
  t.floor = round3(Math.max(t.offer ?? 0, t.floor - (t.floor - (t.offer ?? 0)) * 0.15));
  a.mood = round3(clamp(a.mood - 0.1, -1, 1));
  postMessage(state, { airlineId: airline.id, kind: 'strikeAnnounced', level: 'warning', params: { country: a.country, group: a.group, from, days, warning: warning ? 1 : 0 } });
}

/** Share of a station's flights that can't fly on the day of `time` because of strikes. */
export function strikeShare(world: EngineWorld, airline: Airline, station: string, time: SimTime): number {
  if (!airline.labour) return 0;
  const country = countryOf(world, station);
  const culture = strikeCulture(country, yearOf(time));
  let flying = 1;
  for (const group of GROUPS) {
    const a = airline.labour[agreementKey(country, group)];
    const s = a?.strikes.find((x) => x.from <= time && time < x.until);
    if (!s) continue;
    flying *= 1 - STRIKE_PARTICIPATION[group] * (s.warning ? WARNING_SHARE : 1) * (1 - culture.minimumService);
  }
  return 1 - flying;
}

/** Is this pair cancelled by a strike on the day of `time`? (a stable share of the station's flights) */
export function strikeCancelsPair(state: GameState, world: EngineWorld, route: Route, pair: FlightPair, time: SimTime): boolean {
  const airline = state.airlines[route.airlineId];
  const aircraft = state.aircraft[pair.aircraftId];
  if (!airline?.labour || !aircraft) return false;
  const share = strikeShare(world, airline, stationOf(airline, aircraft), startOfDay(time));
  return share > 0 && hash01(`strike|${pair.id}|${startOfDay(time)}`) < share;
}

/** Yesterday's flights cancelled by strikes: care, and EU 261 compensation unless announced 14 days ahead (from 2021). */
function bookStrikeCancellations(state: GameState, world: EngineWorld, airline: Airline): void {
  const day = startOfDay(state.time - DAY);
  if (!Object.values(airline.labour ?? {}).some((a) => a.strikes.some((s) => s.from <= day && day < s.until))) return;
  const last = state.finance[airline.id]?.history.at(-1);
  const euCarrier = EU261_COUNTRIES.has(countryOf(world, airline.hubId));
  let flights = 0;
  let eur = 0;
  let pax = 0;
  for (const pair of Object.values(state.flights)) {
    if (pair.airlineId !== airline.id) continue;
    const route = state.routes[pair.routeId];
    const aircraft = state.aircraft[pair.aircraftId];
    if (!route || !aircraft || aircraft.status !== 'active') continue;
    if (pairDepartureUtc(world, route, pair, day) === null || !strikeCancelsPair(state, world, route, pair, day)) continue;
    const country = countryOf(world, stationOf(airline, aircraft));
    const notice = Math.min(...GROUPS.map((g) => airline.labour?.[agreementKey(country, g)]?.strikes.find((s) => s.from <= day && day < s.until)).filter((s) => !!s).map((s) => s!.from - s!.announced));
    const stats = last?.routes[route.id];
    const lf = stats && stats.seats > 0 ? stats.pax / stats.seats : 0.8;
    const people = 2 * Math.round(aircraft.seats * Math.min(1, lf));
    const covered = (euCarrier || EU261_COUNTRIES.has(countryOf(world, route.originId))) && toDate(day).toISOString().slice(0, 10) >= STRIKE_COMPENSATION_FROM && notice < 14 * DAY;
    eur += people * (careEur(4) + (covered ? CLAIM_SHARE * eu261Eur(route.distanceKm) : 0));
    pax += people;
    flights += 2;
  }
  if (!flights) return;
  const cost = -book(state, airline.id, 'compensation', money(-Math.round(eur * priceLevelAt(state.time)), 'EUR')).amount;
  bookPnl(state, airline.id, 'disruption', cost);
  // Passengers are less forgiving of the airline than of the weather, more of a strike than of a breakdown.
  const rep = state.reputation[airline.id];
  if (rep && pax > 0) addExperience(rep, { Y: { pax, product: 0, age: 0, value: 0, crowd: 0, disruption: -15 * pax } });
  postMessage(state, { airlineId: airline.id, kind: 'strikeCancellations', level: 'warning', params: { count: flights } });
}

// ─── Daily step ──────────────────────────────────────────────────────────────────

export function labourDailyStep(state: GameState, world: EngineWorld): void {
  const date = toDate(state.time);
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human' || !airline.labour) continue;
    for (const [key, a] of Object.entries(airline.labour)) {
      if (a.step && a.step.at <= state.time) {
        a.pay = round3(a.pay * a.step.factor);
        a.step = undefined;
      }
      a.strikes = a.strikes.filter((s) => s.until > state.time - 2 * DAY);
      if (date.getUTCDate() === 1) a.mood = round3(a.mood * 0.97);
      if (!a.talks) {
        if (state.time >= a.until - TALKS_WEEKS_BEFORE * WEEK) openTalks(state, airline, a);
        continue;
      }
      const t = a.talks;
      if (t.mediationUntil !== undefined && t.proposal === undefined && state.time >= t.mediationUntil) {
        t.proposal = round3((t.demand + Math.max(t.offer ?? 0, t.inflation)) / 2);
        t.proposalUntil = state.time + WEEK;
        postMessage(state, { airlineId: airline.id, kind: 'mediationProposal', level: 'caution', params: { country: a.country, group: a.group, proposal: t.proposal * 100 } });
      } else if (t.proposalUntil !== undefined && state.time >= t.proposalUntil) {
        // No answer: the HR department accepts it if it plans automatically, else the proposal lapses.
        answerProposal(state, airline.id, key, !!airline.crew?.auto);
        if (!airline.labour[key]?.talks) continue;
      }
      // The player didn't make an offer for a week after one was possible: HR offers, starting low and moving up each round
      // (about inflation first, then a growing share of the gap), and calls mediation if a strike is coming.
      if (airline.crew?.auto && t.mediationUntil === undefined && a.strikes.some((x) => x.from > state.time) && (t.actions ?? 0) >= 2) {
        callMediation(state, airline.id, key);
        continue;
      }
      if (airline.crew?.auto && t.mediationUntil === undefined && state.time >= t.nextRound + WEEK) {
        const offer = round3(Math.min(t.demand, Math.max(t.inflation * 0.9 + (t.demand - t.inflation * 0.9) * (0.1 + 0.25 * t.round), t.offer ?? 0)));
        offerWage(state, airline.id, key, offer, true);
        if (!a.talks) continue;
      }
      if (date.getUTCDay() === 1) maybeStrike(state, airline, a);
    }
    bookStrikeCancellations(state, world, airline);
  }
}

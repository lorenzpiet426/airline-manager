// The player's hub on the ground (Phase 7.3): gates and lounges.
//
// Gates: the player rents contact gates (jet bridge at the terminal) and remote stands (passengers go by bus) at the
// hub. Every aircraft on the ground needs one: from landing until 30 minutes later and from 60 minutes before take-off
// (one gate for a quick turnaround; aircraft staying longer are towed to a parking position in between). Flights take
// the contact gates in order of time, the rest stand remote. A remote stand means a bus (costs, a worse experience) and
// connections take 10 minutes longer. How many gates are still free depends on the airport's size and how busy it is.
//
// Lounges: an own lounge at the hub (size and quality chosen by the player) replaces the contract lounge the airline
// otherwise pays per business and first class passenger; it costs building and running, and premium passengers rate it
// (too small: crowded). At outstations where a partner has its hub, the partner's lounge is used.
import type { Airport } from '../data/types';
import type { GroundContext } from './economics';
import { slotAirport } from '../data/slots';
import { book, postMessage, schedule } from './core';
import { priceLevelAt } from './era';
import { convert, money } from './money';
import { pairTimes } from './schedule';
import { slotUse } from './slots';
import type { Airline, GameState, Lounge, LoungeQuality } from './state';
import { addMonths, type SimTime } from './time';
import { hasDay } from './timetable';
import type { EngineWorld } from './world';

const WEEK = 7 * 1440;
const STEP = 5;
/** Minutes an aircraft occupies its gate after landing and before take-off. */
const AFTER_LANDING = 30;
const BEFORE_TAKEOFF = 60;
/** A turnaround longer than this frees the gate in between (the aircraft is towed to a parking position). */
const TOW_AFTER_MIN = 180;
/** Rent per gate and year (2025 USD; modelled: European airports charge boarding bridges and stands mostly per use —
 * these stand for those charges over a year of use). */
export const CONTACT_GATE_USD_YEAR = 350_000;
export const REMOTE_STAND_USD_YEAR = 60_000;
/** Buses to and from a remote stand, per flight (both directions' passengers), USD. */
export const BUS_USD_PER_FLIGHT = 140;
/** Experience points for a remote stand (the bus) per passenger, and extra connecting time. */
export const REMOTE_EXPERIENCE = -3;
export const REMOTE_MCT_EXTRA = 10;

/** Gates at an airport: contact gates and remote stands (slot-coordinated airports: from their capacity per hour). */
export function gatesAt(airport: Airport): { contact: number; remote: number } {
  const capacity = slotAirport(airport.id)?.capacity ?? (airport.size === 'large' ? 50 : airport.size === 'medium' ? 18 : 6);
  return { contact: airport.size === 'small' ? 0 : Math.round(capacity * 0.5), remote: Math.round(capacity * 0.9) };
}

/** Gates still free for the player (the other airlines use their share; busy airports have few left). */
export function freeGates(state: GameState, world: EngineWorld, airlineId: string, airportId: string): { contact: number; remote: number } {
  const airport = world.airportById.get(airportId);
  if (!airport) return { contact: 0, remote: 0 };
  const total = gatesAt(airport);
  const use = slotAirport(airportId) ? slotUse(world, airportId, state.time) : airport.size === 'large' ? 0.75 : airport.size === 'medium' ? 0.55 : 0.4;
  const rented = state.airlines[airlineId]?.gates ?? { contact: 0, remote: 0 };
  return {
    contact: Math.max(0, Math.floor(total.contact * (1 - use)) - rented.contact),
    remote: Math.max(0, Math.floor(total.remote * (1 - 0.6 * use)) - rented.remote),
  };
}

/** One gate visit at the hub: [from, to) in minutes of the week (hub local), and the flights it serves. */
interface Visit {
  from: number;
  to: number;
  keys: string[];
}

export interface HubGates {
  /** Most aircraft on the ground at the same time, and when (minute of the week). */
  peak: number;
  peakAt: number;
  /** Gate need per 5 minutes of the week. */
  load: number[];
  /** Each hub flight ("pairId:dir") on a contact gate or a remote stand. */
  gateOf: Map<string, 'contact' | 'remote'>;
  /** Visits that found no gate at all (more aircraft than gates rented). */
  short: number;
}

/** The airline's gate visits at its hub in a week, and the contact gates or remote stands they get. */
export function hubGates(state: GameState, world: EngineWorld, airlineId: string): HubGates {
  const airline = state.airlines[airlineId];
  const hubId = airline?.hubId ?? '';
  // Landings and take-offs at the hub per aircraft, in time order.
  const moves = new Map<string, { at: number; key: string; landing: boolean }[]>();
  for (const pair of Object.values(state.flights)) {
    const route = state.routes[pair.routeId];
    const aircraft = state.aircraft[pair.aircraftId];
    if (!route || !aircraft || pair.airlineId !== airlineId || route.originId !== hubId) continue;
    const t = pairTimes(world, aircraft.typeId, route, pair, state.time);
    const list = moves.get(aircraft.id) ?? moves.set(aircraft.id, []).get(aircraft.id)!;
    for (let d = 0; d < 7; d++) {
      if (!hasDay(pair.days, d)) continue;
      list.push({ at: (d * 1440 + t.outDep) % WEEK, key: `${pair.id}:0`, landing: false });
      list.push({ at: (d * 1440 + t.backArr) % WEEK, key: `${pair.id}:1`, landing: true });
    }
  }
  const visits: Visit[] = [];
  for (const list of moves.values()) {
    list.sort((a, b) => a.at - b.at);
    // Each landing is followed by the aircraft's next take-off (around the week).
    list.forEach((m, i) => {
      if (m.landing) {
        const next = list.slice(i + 1).find((x) => !x.landing) ?? list.find((x) => !x.landing);
        if (!next) {
          visits.push({ from: m.at, to: m.at + AFTER_LANDING, keys: [m.key] });
          return;
        }
        const ground = (((next.at - m.at) % WEEK) + WEEK) % WEEK;
        if (ground <= TOW_AFTER_MIN) visits.push({ from: m.at, to: m.at + ground, keys: [m.key, next.key] });
        else {
          visits.push({ from: m.at, to: m.at + AFTER_LANDING, keys: [m.key] });
          visits.push({ from: m.at + ground - BEFORE_TAKEOFF, to: m.at + ground, keys: [next.key] });
        }
      } else {
        const prev = [...list.slice(0, i)].reverse().find((x) => x.landing) ?? [...list].reverse().find((x) => x.landing);
        // A take-off whose landing is far before it gets its own boarding visit (added from the landing's side when
        // the ground time is long; here only when there is no landing at all, e.g. an aircraft's first flight).
        if (!prev) visits.push({ from: m.at - BEFORE_TAKEOFF, to: m.at, keys: [m.key] });
      }
    });
  }
  const slots = WEEK / STEP;
  const load = new Array<number>(slots).fill(0);
  const cell = (minute: number) => ((Math.floor(minute / STEP) % slots) + slots) % slots;
  for (const v of visits) for (let m = v.from; m < v.to; m += STEP) load[cell(m)]!++;
  let peak = 0;
  let peakAt = 0;
  load.forEach((n, i) => {
    if (n > peak) [peak, peakAt] = [n, i * STEP];
  });
  // Contact gates first come, first served; the others stand remote.
  const rented = airline?.gates ?? { contact: 0, remote: 0 };
  const contactUse = new Array<number>(slots).fill(0);
  const remoteUse = new Array<number>(slots).fill(0);
  const gateOf = new Map<string, 'contact' | 'remote'>();
  let short = 0;
  for (const v of [...visits].sort((a, b) => a.from - b.from)) {
    const cells: number[] = [];
    for (let m = v.from; m < v.to; m += STEP) cells.push(cell(m));
    const fits = (use: number[], max: number) => cells.every((c) => use[c]! < max);
    const kind = fits(contactUse, rented.contact) ? 'contact' : fits(remoteUse, rented.remote) ? 'remote' : null;
    if (!kind) short++;
    for (const c of cells) (kind === 'contact' ? contactUse : remoteUse)[c]!++;
    for (const k of v.keys) gateOf.set(k, kind ?? 'remote');
  }
  return { peak, peakAt, load, gateOf, short };
}

const hubCache = new WeakMap<GameState, { key: string; gates: HubGates }>();
/** hubGates, cached until the timetable or the gates rented change. */
export function hubGatesCached(state: GameState, world: EngineWorld, airlineId: string): HubGates {
  const g = state.airlines[airlineId]?.gates;
  const key = `${airlineId}|${g?.contact ?? 0}|${g?.remote ?? 0}|${Object.values(state.flights)
    .filter((p) => p.airlineId === airlineId)
    .map((p) => `${p.id}${p.dep}${p.days}${p.groundMin}${p.aircraftId}`)
    .join('')}`;
  const hit = hubCache.get(state);
  if (hit?.key === key) return hit.gates;
  const gates = hubGates(state, world, airlineId);
  hubCache.set(state, { key, gates });
  return gates;
}

/**
 * After a timetable change: rents the remote stands the new peak needs (if the airport has them free). Returns false
 * when there aren't enough gates (the change is then refused).
 */
export function ensureGates(state: GameState, world: EngineWorld, airlineId: string): boolean {
  const airline = state.airlines[airlineId];
  if (!airline) return true;
  airline.gates ??= { contact: 0, remote: 0 };
  const need = hubGates(state, world, airlineId).peak;
  const missing = need - airline.gates.contact - airline.gates.remote;
  if (missing <= 0) return true;
  const free = freeGates(state, world, airlineId, airline.hubId);
  if (free.remote < missing) return false;
  airline.gates.remote += missing;
  postMessage(state, { airlineId, kind: 'gatesRented', level: 'info', params: { remote: missing, total: airline.gates.contact + airline.gates.remote } });
  return true;
}

/** First use (old saves, takeovers): the airline keeps the gates its timetable uses — at its hub mostly contact gates. */
export function grantHistoricGates(state: GameState, world: EngineWorld, airlineId: string): void {
  const airline = state.airlines[airlineId];
  const hub = airline && world.airportById.get(airline.hubId);
  if (!airline || !hub) return;
  const need = hubGates(state, world, airlineId).peak;
  const contact = Math.min(need, Math.round(gatesAt(hub).contact * 0.8));
  airline.gates = { contact, remote: Math.max(0, need - contact) };
}

export function ensureHubFacilities(state: GameState, world: EngineWorld): void {
  for (const airline of Object.values(state.airlines)) if (airline.controller === 'human' && !airline.gates) grantHistoricGates(state, world, airline.id);
}

/** Renting or giving back gates (totals); fewer than the timetable needs at its peak is refused. */
export function setGates(state: GameState, world: EngineWorld, airlineId: string, contact: number, remote: number): 'gatesUnavailable' | 'gatesNeeded' | null {
  const airline = state.airlines[airlineId]!;
  const now = airline.gates ?? { contact: 0, remote: 0 };
  const free = freeGates(state, world, airlineId, airline.hubId);
  if (!Number.isInteger(contact) || !Number.isInteger(remote) || contact < 0 || remote < 0) return 'gatesUnavailable';
  if (contact - now.contact > free.contact || remote - now.remote > free.remote) return 'gatesUnavailable';
  if (contact + remote < hubGates(state, world, airlineId).peak) return 'gatesNeeded';
  airline.gates = { contact, remote };
  return null;
}

/** Daily gate rent (USD, prices of the year) for the accounts. */
export const gateRentPerDayUsd = (airline: Airline, time: SimTime): number =>
  (((airline.gates?.contact ?? 0) * CONTACT_GATE_USD_YEAR + (airline.gates?.remote ?? 0) * REMOTE_STAND_USD_YEAR) / 365) * priceLevelAt(time);

// ─── Lounges ─────────────────────────────────────────────────────────────────────

export const LOUNGE_QUALITIES: readonly LoungeQuality[] = ['standard', 'premium', 'flagship'];
/** Per seat (2025 USD; modelled from published lounge projects: a 300-seat flagship lounge ≈ $15–20 m). */
export const LOUNGE_BUILD_USD_PER_SEAT: Record<LoungeQuality, number> = { standard: 15_000, premium: 30_000, flagship: 55_000 };
/** Rent, staff and upkeep per seat and year. */
export const LOUNGE_RUN_USD_PER_SEAT_YEAR: Record<LoungeQuality, number> = { standard: 4_000, premium: 7_000, flagship: 12_000 };
/** Food and drinks per visitor (an own lounge replaces the contract lounge's fee). */
export const LOUNGE_VISITOR_USD: Record<LoungeQuality, number> = { standard: 10, premium: 18, flagship: 32 };
/** What premium passengers think of the lounge (experience points; contract lounge = 0, partner lounge = 2). */
export const LOUNGE_EXPERIENCE: Record<LoungeQuality, number> = { standard: 3, premium: 6, flagship: 9 };
export const PARTNER_LOUNGE_EXPERIENCE = 2;
/** The contract lounge's fee per business / first class passenger (part of the service cost). */
export const CONTRACT_LOUNGE_USD = { J: 30, F: 55 } as const;
export const LOUNGE_BUILD_MONTHS = 6;
export const LOUNGE_SEATS = [50, 800] as const;
/** Premium passengers in the lounge at once: about this share of a day's departing business/first passengers. */
const PEAK_SHARE = 0.18;

export const loungeAt = (airline: Airline | undefined, airportId: string, time: SimTime): Lounge | undefined =>
  airline?.lounges?.find((l) => l.airportId === airportId && l.readyAt <= time);

/** Building a lounge at the hub: cash now, open after LOUNGE_BUILD_MONTHS. */
export function buildLounge(state: GameState, world: EngineWorld, airlineId: string, seats: number, quality: LoungeQuality): 'loungeInvalid' | 'loungeExists' | 'insufficientCash' | null {
  const airline = state.airlines[airlineId]!;
  if (!Number.isInteger(seats) || seats < LOUNGE_SEATS[0] || seats > LOUNGE_SEATS[1] || !LOUNGE_QUALITIES.includes(quality)) return 'loungeInvalid';
  if (airline.lounges?.some((l) => l.airportId === airline.hubId)) return 'loungeExists';
  const usd = seats * LOUNGE_BUILD_USD_PER_SEAT[quality] * priceLevelAt(state.time);
  if (airline.cash.amount < convert(money(usd, 'USD'), airline.currency, state.fx).amount) return 'insufficientCash';
  book(state, airlineId, 'lounge', money(-usd, 'USD'));
  const readyAt = addMonths(state.time, LOUNGE_BUILD_MONTHS);
  (airline.lounges ??= []).push({ airportId: airline.hubId, seats, quality, readyAt, builtUsd: usd });
  schedule(state, { at: readyAt, kind: 'loungeReady', airlineId, airportId: airline.hubId });
  postMessage(state, { airlineId, kind: 'loungeOrdered', level: 'info', params: { airport: world.airportById.get(airline.hubId)?.iata ?? airline.hubId, seats } });
  return null;
}

export function closeLounge(state: GameState, airlineId: string, airportId: string): 'loungeUnknown' | null {
  const airline = state.airlines[airlineId]!;
  if (!airline.lounges?.some((l) => l.airportId === airportId)) return 'loungeUnknown';
  airline.lounges = airline.lounges.filter((l) => l.airportId !== airportId);
  return null;
}

/** Daily running cost of the airline's open lounges (USD, prices of the year). */
export const loungeRunPerDayUsd = (airline: Airline, time: SimTime): number =>
  (airline.lounges ?? []).filter((l) => l.readyAt <= time).reduce((s, l) => s + (l.seats * LOUNGE_RUN_USD_PER_SEAT_YEAR[l.quality]) / 365, 0) * priceLevelAt(time);

/** Business and first class passengers departing the hub last week (from the route statistics). */
export function premiumDeparturesPerWeek(state: GameState, airlineId: string): number {
  const week = state.finance[airlineId]?.history.at(-1);
  if (!week) return 0;
  let n = 0;
  for (const [routeId, r] of Object.entries(week.routes)) {
    if (state.routes[routeId]?.airlineId !== airlineId) continue;
    // Half of a route's passengers leave from the hub.
    n += ((r.classes?.J?.pax ?? 0) + (r.classes?.F?.pax ?? 0)) / 2;
  }
  return n;
}

/** Premium passengers in the lounge at the busiest time, and how crowded it is (1 = full; above = overcrowded). */
export function loungeCrowding(state: GameState, airlineId: string, lounge: Lounge): { peak: number; load: number } {
  const peak = (premiumDeparturesPerWeek(state, airlineId) / 7) * PEAK_SHARE;
  return { peak, load: peak / lounge.seats };
}

/** What an own lounge adds to a premium passenger's experience (crowding takes it away again). */
export function loungeExperience(lounge: Lounge, load: number): number {
  return LOUNGE_EXPERIENCE[lounge.quality] - Math.max(0, load - 1) * 12;
}

/** What the weekly calculation needs to know about the airline on the ground (gates, own lounge, partners' lounges). */
export function groundContext(state: GameState, world: EngineWorld, airlineId: string): GroundContext | undefined {
  const airline = state.airlines[airlineId];
  if (!airline || airline.controller !== 'human') return undefined;
  const lounge = loungeAt(airline, airline.hubId, state.time);
  const partnerLounges = new Set<string>();
  for (const id of airline.partners ?? []) for (const h of world.realAirlines?.byId.get(id)?.hubs ?? []) partnerLounges.add(h);
  return {
    hubId: airline.hubId,
    ...(airline.gates ? { gateOf: hubGatesCached(state, world, airlineId).gateOf } : {}),
    ...(lounge ? { lounge: { experience: loungeExperience(lounge, loungeCrowding(state, airlineId, lounge).load), visitorUsd: LOUNGE_VISITOR_USD[lounge.quality] } } : {}),
    ...(partnerLounges.size ? { partnerLounges } : {}),
  };
}

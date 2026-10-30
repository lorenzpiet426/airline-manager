// Taking over a real airline (Phase 6.2, past years 6.4): the player becomes its CEO. The airline keeps its name, codes,
// colours, its aircraft (today: registrations from the official registers; in a past year: the fleet of that year, with
// registrations made up in its real series) and its routes from the hub; the game plans a complete timetable on that
// fleet (real timetables may not be copied, so it is "modelled"). The real airline stops flying as an AI airline, and its
// partners of the time (its group, subsidiaries, alliance) leave its routes alone and feed it passengers.
import { getAircraftType, isFreighter, TURNAROUND_MIN, type AircraftType } from '../data/aircraft';
import { TAKEOVERS, type FleetEra, type TakeoverScenario } from '../data/takeovers';
import { membersOn } from '../data/alliances';
import { priceLevelAt, REAL_AIRLINES_FROM } from './era';
import { conditionsOf } from './worldEvents';
import type { Airport } from '../data/types';
import { airlineCabin } from './ai';
import { totalSeats } from './cabins';
import { book, nextId, postMessage, schedule } from './core';
import { capacitySeason, checkRoute, competitorsOn, MODEL_FARE, roundTripHours, WEEKLY_AVAILABLE_HOURS } from './economics';
import { aircraftMarketValueUsd, newOwnership } from './fleet';
import { defaultLivery } from './livery';
import { ensureMaint } from './maintenance';
import { typicalRentUsd } from './market';
import { convert, money } from './money';
import type { RealAirline } from './realAirlines';
import { newReputation } from './reputation';
import { MODEL_REPUTATION } from './cabins';
import { busyIntervals, curfewProblem, freeFlightNumber, pairBlocks, pairsOfRoute, setRoutePairs, type FlightSpec } from './schedule';
import { grantHistoricSlots } from './slots';
import { grantHistoricGates, hubGates, LOUNGE_SEATS } from './hub';
import { ensureCrew, grantCrewForNeeds } from './crews';
import { ensureLabour } from './unions';
import { composePartners } from './alliances';
import { appointHeads } from './managers';
import { joinPartnerProgramme } from './loyalty';
import { startHedging } from './hedging';
import { GROUP_POLICY } from '../data/hedging';
import type { Aircraft, GameState, Route } from './state';
import { addMonths, MINUTES_PER_DAY, MINUTES_PER_WEEK, simTime, startOfDay, toDate, yearOf, type SimTime } from './time';
import { DAYS_ALL, hasDay, homeDepartures, isEastbound, seedOf, spreadDays } from './timetable';
import { bookCurrencyAt, startingCapital } from './commands';
import { distanceKm } from './geo';
import { newFinance } from './operations';
import type { EngineWorld } from './world';

export type TakeoverError = 'scenarioUnknown' | 'notYet' | 'noRealAirline' | 'alreadyPlaying';

export const takeoverScenario = (realId: string): TakeoverScenario | undefined => TAKEOVERS[realId];

/** The real airlines of a group: by parent company (and their own subsidiaries), plus the listed extra partners. */
export function groupPartners(world: EngineWorld, scenario: TakeoverScenario): string[] {
  const real = world.realAirlines;
  if (!real) return [];
  const members = new Set<string>();
  for (const a of real.byId.values()) if (a.parent === scenario.group) members.add(a.id);
  // Subsidiaries of members (Edelweiss belongs to SWISS).
  const names = new Set([...members].map((id) => real.byId.get(id)!.name));
  for (const a of real.byId.values()) if (a.parent && names.has(a.parent)) members.add(a.id);
  for (const id of scenario.extraPartners) if (real.byId.has(id)) members.add(id);
  members.delete(scenario.realId);
  return [...members].sort();
}

/**
 * The partners on a day (Phase 6.4): the group once the airline belonged to it, its own subsidiaries of the time, and
 * the other members of every alliance it was in that day — only airlines flying that day.
 */
export function partnersAt(world: EngineWorld, scenario: TakeoverScenario, date: Date): string[] {
  const real = world.realAirlines;
  if (!real) return [];
  const day = date.toISOString().slice(0, 10);
  const ids = new Set<string>(day >= scenario.groupFrom ? groupPartners(world, scenario) : []);
  for (const id of membersOn(scenario.ownGroup, day)) ids.add(id);
  for (const alliance of scenario.alliances) if (membersOn(alliance, day).includes(scenario.realId)) for (const id of membersOn(alliance, day)) ids.add(id);
  ids.delete(scenario.realId);
  return [...ids].filter((id) => real.byId.has(id)).sort();
}

/** Monthly: the partners of airlines taken over follow history (alliances joined and left, subsidiaries bought). */
export function refreshPartners(state: GameState, world: EngineWorld): void {
  // Group and alliance of the time, controlled companies (Phase 10.5), alliances and codeshares (Phase 11.1).
  for (const airline of Object.values(state.airlines)) if (airline.controller === 'human') composePartners(state, world, airline);
  absorbSubsidiaries(state, world);
}

/** Aircraft of each fleet line in `year` (new ones arrive over three years, old ones leave over two). */
export function fleetLinesIn(scenario: TakeoverScenario, year: number): { line: FleetEra; count: number }[] {
  return scenario.fleetHistory
    .map((line) => {
      if (year < line.from || (line.until !== null && year >= line.until)) return { line, count: 0 };
      const arriving = line.atOnce ? 1 : Math.min(1, (year - line.from + 1) / 3);
      const leaving = line.until === null ? 1 : Math.min(1, (line.until - year) / 2);
      return { line, count: Math.round(line.count * arriving * leaving) };
    })
    .filter((x) => x.count > 0);
}

/** The airline's cash at the start, in today's euros: today's amount scaled by the size of the fleet of the year. */
export function takeoverCashEur(scenario: TakeoverScenario, year: number | undefined): number {
  if (year === undefined || year >= REAL_AIRLINES_FROM) return scenario.cashEur;
  const seats = (y: number) => fleetLinesIn(scenario, y).reduce((s, x) => s + x.count * getAircraftType(x.line.type).seats.typical, 0);
  // Rounded to 2 significant digits, like a startup's capital.
  const eur = (scenario.cashEur * seats(year)) / Math.max(1, seats(REAL_AIRLINES_FROM));
  const e = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, eur))) - 1);
  return Math.round(eur / e) * e;
}

/** Spreads n values evenly over [lo, hi] (inclusive), rounded. */
const spread = (i: number, n: number, lo: number, hi: number) => (n <= 1 ? Math.round((lo + hi) / 2) : Math.round(lo + ((hi - lo) * i) / (n - 1)));

export interface TakeoverResult {
  airlineId: string;
  routes: number;
  /** Summer-only routes not in a winter timetable, routes the fleet couldn't fit, routes not from the hub. */
  seasonalSkipped: number;
  unplanned: number;
  notFromHub: number;
}

/** Makes the player the CEO of a real airline today. */
export function takeOver(state: GameState, world: EngineWorld, realId: string): { ok: true; result: TakeoverResult } | { ok: false; error: TakeoverError } {
  const scenario = takeoverScenario(realId);
  const real = world.realAirlines?.byId.get(realId);
  if (!scenario) return { ok: false, error: 'scenarioUnknown' };
  if (!real) return { ok: false, error: 'noRealAirline' };
  const past = state.options.startYear !== undefined && state.options.startYear < REAL_AIRLINES_FROM;
  if (past && !fleetLinesIn(scenario, yearOf(state.time)).length) return { ok: false, error: 'notYet' };
  if (Object.values(state.airlines).some((a) => a.controller === 'human')) return { ok: false, error: 'alreadyPlaying' };
  const hub = world.airportById.get(real.hubs[0] ?? '');
  if (!hub) return { ok: false, error: 'noRealAirline' };

  const id = nextId(state, 'AL');
  const currency = bookCurrencyAt(state, hub.country);
  const [primary, secondary] = [real.colors.primary, real.colors.secondary];
  state.airlines[id] = {
    id,
    name: real.name,
    iata: real.iata ?? realId.slice(0, 2),
    icao: real.icao ?? realId,
    controller: 'human',
    hubId: hub.id,
    colors: { primary, secondary },
    currency,
    cash: money(0, currency),
    foundedAt: state.time,
    realId,
    partners: partnersAt(world, scenario, toDate(state.time)),
  };
  const airline = state.airlines[id]!;
  airline.liveries = [{ ...defaultLivery(airline.colors, scenario.livery.titles, airline.iata), tail: scenario.livery.tail, logo: { kind: 'none' } }];
  state.finance[id] = newFinance(state.time);
  // A well-known brand: everybody knows it, with a network airline's usual standing.
  state.reputation[id] = { ...newReputation(1), score: MODEL_REPUTATION[real.model] };
  state.ai.airlines[realId] = { status: 'player', health: 0, since: state.time };
  if (past) book(state, id, 'capital', startingCapital(state.fx, takeoverCashEur(scenario, yearOf(state.time)), currency, priceLevelAt(state.time)));
  else book(state, id, 'capital', convert(money(scenario.cashEur, 'EUR'), currency, state.fx));

  if (past) addFleetOfYear(state, airline.id, real, scenario, hub);
  else addFleet(state, airline.id, real, scenario, hub);
  const result = addNetwork(state, world, airline.id, real, hub);
  postMessage(state, { airlineId: id, kind: 'takenOver', level: 'info', params: { name: real.name, aircraft: Object.values(state.aircraft).filter((a) => a.airlineId === id && a.status === 'active').length, routes: result.routes } });
  if (result.seasonalSkipped || result.unplanned || result.notFromHub) {
    postMessage(state, { airlineId: id, kind: 'takeoverRoutes', level: 'caution', params: { seasonal: result.seasonalSkipped, unplanned: result.unplanned, other: result.notFromHub } });
  }
  absorbSubsidiaries(state, world);
  // The airline's flights keep their slots (historic rights, Phase 7.2) and its gates at the hub (7.3).
  grantHistoricSlots(state, world, id);
  grantHistoricGates(state, world, id);
  // Its pilots and cabin crew (Phase 8.1): as many as the timetable needs.
  ensureCrew(state, world);
  // Its unions (Phase 8.2): Austrian's cockpit and cabin agreement with vida, signed after the 2024 strikes, runs until the
  // end of 2026 (ORF, June 2024); other years: agreements running out at modelled times.
  const realAgreement = simTime(2026, 12, 31);
  ensureLabour(state, world, scenario.realId === 'AUA' && state.time >= simTime(2024, 6, 1) && state.time < realAgreement ? { AT: realAgreement } : undefined);
  // Its heads of department (Phase 8.3): fares and the fleet proposed for the player's OK, the network as advice.
  appointHeads(state, world, id, { hr: 'auto', revenue: 'approve', network: 'advise', fleet: 'approve', maintenance: 'approve' });
  // Its group's frequent-flyer programme (Phase 9.4).
  if (scenario.loyalty && yearOf(state.time) >= scenario.loyalty.from) joinPartnerProgramme(state, id, scenario.loyalty.name);
  // Its owner's backing for lenders (Phase 10.1).
  // Its treasury hedges fuel and dollars like the group does (Phase 10.2); the ladder fills as the first months are booked.
  startHedging(state, world, id, GROUP_POLICY);
  if (scenario.parentRating) airline.parentRating = yearOf(state.time) >= scenario.parentRating.from ? scenario.parentRating.after : scenario.parentRating.before;
  // Its own lounges at the hub (today's size, smaller with a smaller fleet in past years; already open).
  const scale = past ? Math.min(1, takeoverCashEur(scenario, yearOf(state.time)) / scenario.cashEur) : 1;
  const seats = Math.max(LOUNGE_SEATS[0], Math.min(LOUNGE_SEATS[1], Math.round((scenario.hubLounge.seats * scale) / 10) * 10));
  airline.lounges = [{ airportId: hub.id, seats, quality: scenario.hubLounge.quality, readyAt: state.time - ESTABLISHED_DAYS * MINUTES_PER_DAY, builtUsd: 0 }];
  return { ok: true, result: { ...result, airlineId: id } };
}

/**
 * Subsidiaries at the hub (Tyrolean from 1997, Lauda Air from 2001) flew for the airline, not against it: once owned,
 * their aircraft (types the airline doesn't fly yet; the others were shared out in reality) and their routes from the hub
 * become the player's, and they stop flying as AI airlines. Called at the takeover and every month.
 */
export function absorbSubsidiaries(state: GameState, world: EngineWorld): void {
  const day = toDate(state.time).toISOString().slice(0, 10);
  for (const airline of Object.values(state.airlines)) {
    const scenario = airline.realId ? takeoverScenario(airline.realId) : undefined;
    if (!scenario || airline.controller !== 'human') continue;
    const hub = world.airportById.get(airline.hubId);
    if (!hub) continue;
    for (const subId of membersOn(scenario.ownGroup, day)) {
      const sub = world.realAirlines?.byId.get(subId);
      if (!sub || airline.absorbed?.includes(subId) || (state.ai.airlines[subId] && state.ai.airlines[subId]!.status !== 'active')) continue;
      if (![...sub.hubs, ...sub.bases].includes(hub.id)) continue;
      airline.absorbed = [...(airline.absorbed ?? []), subId];
      state.ai.airlines[subId] = { status: 'player', health: 0, since: state.time };
      const own = new Set(Object.values(state.aircraft).filter((a) => a.airlineId === airline.id).map((a) => a.typeId));
      const series = new Map(scenario.fleetHistory.map((l) => [l.type, l.series]));
      const added = new Set<string>();
      const year = yearOf(state.time);
      for (const f of sub.fleet) {
        let type: AircraftType;
        try {
          type = getAircraftType(f.type);
        } catch {
          continue;
        }
        if (own.has(f.type) || isFreighter(type)) continue;
        const cabin = airlineCabin(type, sub.model, type.category === 'widebody' ? 8000 : 1000, f.seats ?? type.seats.typical);
        for (let i = 0; i < f.inService; i++) {
          const aircraftId = nextId(state, 'AC');
          const a: Aircraft = {
            id: aircraftId,
            typeId: f.type,
            airlineId: airline.id,
            registration: registrationInSeries(state, `OE-L${series.get(f.type) ?? 'K'}`),
            builtYear: Math.min(year - 1, spread(i, f.inService, Math.max(type.eis, year - 10), year - 1)),
            seats: totalSeats(cabin),
            cabin,
            status: 'active',
            deliveryAt: state.time - ESTABLISHED_DAYS * MINUTES_PER_DAY,
            locationId: hub.id,
            paint: 0,
          };
          a.owned = newOwnership(state, a, convert(money(aircraftMarketValueUsd(a, state.time), 'USD'), airline.currency, state.fx).amount, airline.currency);
          state.aircraft[aircraftId] = a;
          ensureMaint(state, a);
          added.add(aircraftId);
        }
      }
      const result = added.size ? addNetwork(state, world, airline.id, sub, hub, added) : { routes: 0 };
      // The subsidiary's slots, gates and crews come with its flights.
      if (state.slots) grantHistoricSlots(state, world, airline.id);
      grantCrewForNeeds(state, world, airline.id);
      if (airline.gates) {
        const need = hubGates(state, world, airline.id).peak;
        airline.gates.remote = Math.max(airline.gates.remote, need - airline.gates.contact);
      }
      postMessage(state, { airlineId: airline.id, kind: 'subsidiaryJoined', level: 'info', params: { airline: sub.name, aircraft: added.size, routes: result.routes } });
    }
  }
}

// ─── Fleet ───────────────────────────────────────────────────────────────────────

function addFleet(state: GameState, airlineId: string, real: RealAirline, scenario: TakeoverScenario, hub: Airport): void {
  const airline = state.airlines[airlineId]!;
  const year = yearOf(state.time);
  const seatsOf = (typeId: string) => real.fleet.find((f) => f.type === typeId)?.seats ?? null;
  // The official register's aircraft, grouped by type (fleet table types without register entries are skipped: the
  // register is the more trusted source).
  const byType = new Map<string, [string, number | null][]>();
  for (const [reg, typeId, built] of real.registered) {
    let type: AircraftType;
    try {
      type = getAircraftType(typeId);
    } catch {
      continue;
    }
    if (isFreighter(type)) continue;
    byType.set(typeId, [...(byType.get(typeId) ?? []), [reg, built]]);
  }
  for (const [typeId, list] of byType) {
    const type = getAircraftType(typeId);
    const [lo, hi] = scenario.builtYears[typeId] ?? [type.eis, Math.min(year - 1, type.eis + 15)];
    const longHaul = type.category === 'widebody';
    const cabin = airlineCabin(type, real.model, longHaul ? 8000 : 1000, seatsOf(typeId) ?? type.seats.typical);
    const leased = scenario.leased[typeId];
    list.sort((x, y) => (x[0] < y[0] ? -1 : 1)).forEach(([registration, built], i) => {
      const builtYear = built ?? spread(i, list.length, lo, hi);
      const aircraftId = nextId(state, 'AC');
      const a: Aircraft = {
        id: aircraftId,
        typeId,
        airlineId,
        registration,
        builtYear,
        seats: totalSeats(cabin),
        cabin,
        status: 'active',
        // In the fleet for a long time already (no ramp-up on its routes).
        deliveryAt: state.time - ESTABLISHED_DAYS * MINUTES_PER_DAY,
        locationId: hub.id,
        paint: 0,
      };
      if (leased) {
        const rent = typicalRentUsd(type, Math.max(0, year - builtYear), year);
        a.lease = {
          lessor: leased.lessor,
          monthlyRent: money(Math.round(rent), 'USD'),
          deposit: money(Math.round(rent * (longHaul ? 3 : 2)), 'USD'),
          startAt: state.time,
          endAt: startOfDay(state.time) + Math.round((leased.endYears[0] + ((leased.endYears[1] - leased.endYears[0]) * i) / Math.max(1, list.length - 1)) * 365.25) * MINUTES_PER_DAY,
        };
      } else {
        // Owned: in the books at today's market value, written off over the rest of its life.
        a.owned = newOwnership(state, a, convert(money(aircraftMarketValueUsd(a, state.time), 'USD'), airline.currency, state.fx).amount, airline.currency);
      }
      state.aircraft[aircraftId] = a;
      ensureMaint(state, a);
    });
  }
  // Group allocations still to come: leased from the group from their delivery day.
  // The types arrive in turn throughout the renewal, one aircraft a month.
  let month = scenario.firstIncomingMonths;
  for (const x of interleave(scenario.incoming)) {
    const type = getAircraftType(x.typeId);
    const at = startOfDay(addMonths(state.time, month++)) + 9 * 60;
    const cabin = airlineCabin(type, real.model, 1000, x.seats);
    const rent = typicalRentUsd(type, 0, yearOf(at));
    const aircraftId = nextId(state, 'AC');
    const d = toDate(at);
    state.aircraft[aircraftId] = {
      id: aircraftId,
      typeId: x.typeId,
      airlineId,
      registration: nextRegistration(state, 'OE-L'),
      builtYear: yearOf(at),
      seats: totalSeats(cabin),
      cabin,
      status: 'delivering',
      deliveryAt: at,
      locationId: hub.id,
      lease: {
        lessor: scenario.leased[x.typeId]?.lessor ?? 'Lufthansa Group',
        monthlyRent: money(Math.round(rent), 'USD'),
        deposit: money(Math.round(rent * 2), 'USD'),
        startAt: at,
        endAt: simTime(d.getUTCFullYear() + 12, d.getUTCMonth() + 1, d.getUTCDate()),
      },
    };
    schedule(state, { at, kind: 'delivery', aircraftId });
  }
}

/**
 * A past year's fleet (Phase 6.4): the airline's own aircraft of that year, owned (a state airline bought its aircraft),
 * built over the years the line arrived (a fleet taken over at once was some years old already). Registrations are made
 * up in the airline's real series (old registers aren't open data).
 */
function addFleetOfYear(state: GameState, airlineId: string, real: RealAirline, scenario: TakeoverScenario, hub: Airport): void {
  const airline = state.airlines[airlineId]!;
  const year = yearOf(state.time);
  for (const { line, count } of fleetLinesIn(scenario, year)) {
    const type = getAircraftType(line.type);
    const cabin = airlineCabin(type, real.model, type.category === 'widebody' ? 8000 : 1000, type.seats.typical);
    const [lo, hi] = line.atOnce ? [Math.max(type.eis, line.from - 8), line.from] : [Math.max(type.eis, line.from), Math.min(year, line.from + 2)];
    for (let i = 0; i < count; i++) {
      const aircraftId = nextId(state, 'AC');
      const a: Aircraft = {
        id: aircraftId,
        typeId: line.type,
        airlineId,
        registration: registrationInSeries(state, `OE-L${line.series}`),
        builtYear: Math.min(year - 1, spread(i, count, lo, hi)),
        seats: totalSeats(cabin),
        cabin,
        status: 'active',
        deliveryAt: state.time - ESTABLISHED_DAYS * MINUTES_PER_DAY,
        locationId: hub.id,
        paint: 0,
      };
      a.owned = newOwnership(state, a, convert(money(aircraftMarketValueUsd(a, state.time), 'USD'), airline.currency, state.fx).amount, airline.currency);
      state.aircraft[aircraftId] = a;
      ensureMaint(state, a);
    }
  }
}

/** Next free registration of a series (OE-LDA, OE-LDB …), then of any OE-L series. */
function registrationInSeries(state: GameState, prefix: string): string {
  const taken = new Set(Object.values(state.aircraft).map((a) => a.registration));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const b of letters) if (!taken.has(`${prefix}${b}`)) return `${prefix}${b}`;
  return nextRegistration(state, prefix.slice(0, -1));
}

/** A320neo, A321neo, A320neo … : the types of an allocation taken in turn. */
function interleave<T extends { count: number }>(groups: T[]): T[] {
  const left = groups.map((g) => g.count);
  const out: T[] = [];
  while (left.some((n) => n > 0)) groups.forEach((g, i) => left[i]! > 0 && (out.push(g), left[i]!--));
  return out;
}

/** Next free registration in a series (OE-LAA … OE-LZZ), skipping those taken in this game or in the real register. */
function nextRegistration(state: GameState, prefix: string): string {
  const taken = new Set(Object.values(state.aircraft).map((a) => a.registration));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Austrian's newer aircraft use the OE-LN… series in the game (the real registrations aren't known yet).
  for (const a of 'NKMHR') for (const b of letters) {
    const reg = `${prefix}${a}${b}`;
    if (!taken.has(reg)) return reg;
  }
  return `${prefix}ZZ`;
}

// ─── Network and timetable ───────────────────────────────────────────────────────

/** Weekly round trips the airline flies to `dest` in the season of `date` (the data's summer schedule, scaled). */
function weeklyNow(world: EngineWorld, real: RealAirline, hub: Airport, dest: Airport, date: Date, growth: number): number {
  const out = competitorsOn(world, hub, dest)?.find((c) => c.airlineId === real.id)?.weekly ?? 0;
  const back = competitorsOn(world, dest, hub)?.find((c) => c.airlineId === real.id)?.weekly ?? out;
  return Math.max(1, Math.round(((out + back) / 2) * capacitySeason(hub, dest, date) * growth));
}

/** IATA winter season (last Sunday of October to the last Sunday of March, here from the 25th): summer-only routes rest. */
const isWinter = (date: Date) => {
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return m >= 10 || m <= 1 || (m === 9 && d >= 25) || (m === 2 && d < 25);
};
/** Tourist arrivals per inhabitant above which a country counts as a holiday country (Greece ≈ 3, Croatia ≈ 4). */
const HOLIDAY_COUNTRY = 1.5;
/** Winter sun (Canaries, Egypt, Gulf): warm enough to fly to in winter. */
const isWarmInWinter = (a: Airport) => Math.abs(a.lat) < 30;
/** How long the airline has flown its routes already (for the ramp-up of new routes). */
export const ESTABLISHED_DAYS = 365;

interface Unit {
  route: Route;
  dest: Airport;
  days: number;
  /** k-th unit of its route (first daily flights are placed before second ones, spreading routes over the day). */
  rank: number;
  long: boolean;
}

interface Line {
  aircraft: Aircraft;
  type: AircraftType;
  busy: [number, number][];
  hours: number;
}

/** Earliest and latest outbound departure from the hub (local). */
const FIRST_DEP = 6 * 60;
const LAST_DEP = 21 * 60 + 30;
/** Flights of one route closer together than this share their passengers: spread them out. */
const ROUTE_SPACING_MIN = 150;
/**
 * Departure waves at the hub (local time; Phase 7.1): a hub airline's flights leave in banks and come back shortly
 * before the next one, so passengers can change planes (Vienna: about five waves a day). Returns should land between
 * ARRIVE_BEFORE_WAVE[0] and [1] minutes before a wave.
 */
const WAVES = [7 * 60, 10 * 60 + 30, 13 * 60 + 30, 17 * 60, 20 * 60 + 30];
const ARRIVE_BEFORE_WAVE = [90, 30] as const;
const range = (from: number, to: number, step: number) => Array.from({ length: Math.max(0, Math.floor((to - from) / step) + 1) }, (_, i) => from + i * step);

/** Minutes a departure is off the nearest wave plus (weighted more: missed connections cost the most) minutes its
 * return lands outside a wave's arrival window. */
function waveMisfit(dep: number, arrival: number): number {
  const depOff = Math.min(...WAVES.map((w) => Math.abs(w - dep)));
  const arr = ((arrival % 1440) + 1440) % 1440;
  const arrOff = Math.min(
    ...[...WAVES, WAVES[0]! + 1440].map((w) => (arr < w - ARRIVE_BEFORE_WAVE[0] ? w - ARRIVE_BEFORE_WAVE[0] - arr : arr > w - ARRIVE_BEFORE_WAVE[1] ? arr - (w - ARRIVE_BEFORE_WAVE[1]) : 0)),
  );
  return depOff * 0.5 + Math.min(arrOff, 240) * 2;
}

/** Share of an aircraft's weekly hours the timetable fills at least, with extra frequencies if needed. */
const IDLE_FILL_SHARE = 0.6;

export function addNetwork(
  state: GameState,
  world: EngineWorld,
  airlineId: string,
  real: RealAirline,
  hub: Airport,
  only?: ReadonlySet<string>,
): Omit<TakeoverResult, 'airlineId'> {
  const date = toDate(state.time);
  const conditions = conditionsOf(state, world);
  // A subsidiary joining later: its aircraft fly its routes, as extra flights where the airline already flies.
  const existing = new Map(Object.values(state.routes).filter((r) => r.airlineId === airlineId && r.originId === hub.id).map((r) => [r.destinationId, r]));
  const fleet = Object.values(state.aircraft).filter((a) => a.airlineId === airlineId && a.status === 'active' && (!only || only.has(a.id)));
  const types = [...new Set(fleet.map((a) => a.typeId))].map(getAircraftType);
  let seasonalSkipped = 0;
  let notFromHub = 0;
  const units: Unit[] = [];
  for (const r of world.realAirlines!.routesOf(real.id)) {
    if (r.a !== hub.id && r.b !== hub.id) {
      notFromHub++;
      continue;
    }
    const dest = world.airportById.get(r.a === hub.id ? r.b : r.a);
    // Seasonal routes to summer holiday airports rest in the winter (Wikipedia doesn't say which season a route is
    // seasonal in): the smaller airports of very touristy countries (Greek islands, Croatian coast …).
    if (r.seasonal && dest && isWinter(date) && dest.size !== 'large' && world.tourismIntensity(dest.country) > HOLIDAY_COUNTRY && !isWarmInWinter(dest)) {
      seasonalSkipped++;
      continue;
    }
    if (!dest || !types.some((t) => !checkRoute(world, t, hub, dest))) continue;
    // Past years: the frequencies of the time (air travel was smaller), like the AI airlines' (Phase 5.3).
    const weekly = weeklyNow(world, real, hub, dest, date, conditions.growth(hub, dest));
    const route: Route = existing.get(dest.id) ?? {
      id: nextId(state, 'R'),
      airlineId,
      originId: hub.id,
      destinationId: dest.id,
      distanceKm: Math.round(distanceKm(hub, dest)),
      aircraftId: '',
      frequency: 0,
      fareFactor: MODEL_FARE[real.model],
      classFares: { W: MODEL_FARE[real.model], J: MODEL_FARE[real.model], F: MODEL_FARE[real.model] },
      flightNumber: 0,
      // Established routes: no new-route ramp-up.
      openedAt: state.time - ESTABLISHED_DAYS * MINUTES_PER_DAY,
    };
    const daily = Math.floor(weekly / 7);
    for (let k = 0; k < daily; k++) units.push({ route, dest, days: DAYS_ALL, rank: k, long: false });
    if (weekly % 7) units.push({ route, dest, days: spreadDays(weekly % 7), rank: daily, long: false });
  }

  const lines: Line[] = fleet.map((a) => ({ aircraft: a, type: getAircraftType(a.typeId), busy: [], hours: 0 }));
  const specs = new Map<string, FlightSpec[]>();
  // Routes flown already keep their flights (new ones are spaced from them).
  for (const u of units) {
    if (state.routes[u.route.id] && !specs.has(u.route.id)) {
      specs.set(u.route.id, pairsOfRoute(state, u.route.id).map((p) => ({ id: p.id, aircraftId: p.aircraftId, dep: p.dep, days: p.days, groundMin: p.groundMin })));
    }
  }
  const before = new Map([...specs].map(([id, list]) => [id, list.length]));
  let unplannedFlights = 0;
  // Long routes first (they need the big aircraft), then each route's first flights, then shorter rotations.
  const seats = (id: string) => world.realAirlines!.observedSeatsPerFlight(hub.id, id);
  // Long-haul = flown with widebodies: measured aircraft size where known (Gran Canaria is far but flown by A320s).
  for (const u of units) u.long = u.route.distanceKm > 4500 || (seats(u.dest.id) ?? 0) > 230;
  units.sort((x, y) => Number(y.long) - Number(x.long) || x.rank - y.rank || y.route.distanceKm - x.route.distanceKm);
  for (const u of units) {
    const placed = placeUnit(world, u, lines, specs, seats(u.dest.id), state.time);
    if (!placed) unplannedFlights += countDays(u.days);
  }

  // Aircraft the timetable left mostly idle fly extra frequencies on routes of their kind (long-haul or not), up to
  // daily, busiest-first: an airline uses the fleet it has.
  const daysOn = (routeId: string) => (specs.get(routeId) ?? []).reduce((n, x) => n + countDays(x.days), 0);
  const byRoute = new Map(units.map((u) => [u.route.id, u]));
  for (const line of [...lines].sort((x, y) => x.hours - y.hours)) {
    const target = WEEKLY_AVAILABLE_HOURS[line.type.category] * IDLE_FILL_SHARE;
    const kind = [...byRoute.values()]
      .filter((u) => u.long === (line.type.category === 'widebody') && !checkRoute(world, line.type, hub, u.dest))
      .sort((x, y) => daysOn(x.route.id) - daysOn(y.route.id) || y.route.distanceKm - x.route.distanceKm);
    for (const u of kind) {
      while (line.hours < target && daysOn(u.route.id) < 7) {
        const n = Math.min(7 - daysOn(u.route.id), 3);
        if (!placeUnit(world, { ...u, days: spreadDays(n), rank: 9 }, [line], specs, seats(u.dest.id), state.time)) break;
      }
      if (line.hours >= target) break;
    }
  }

  let routes = 0;
  const unplannedRoutes = new Set<string>();
  for (const u of units) if (!specs.has(u.route.id)) unplannedRoutes.add(u.route.id);
  const done = new Set<string>();
  for (const u of units) {
    const list = specs.get(u.route.id);
    if (!list || done.has(u.route.id)) continue;
    done.add(u.route.id);
    if (state.routes[u.route.id]) {
      // Extra flights on a route flown already.
      if (list.length > (before.get(u.route.id) ?? 0)) {
        setRoutePairs(state, u.route, list);
        routes++;
      }
      continue;
    }
    u.route.flightNumber = freeFlightNumber(state, airlineId);
    state.routes[u.route.id] = u.route;
    setRoutePairs(state, u.route, list);
    routes++;
  }
  void unplannedFlights;
  return { routes, seasonalSkipped, unplanned: unplannedRoutes.size, notFromHub };
}

const countDays = (days: number) => [0, 1, 2, 3, 4, 5, 6].filter((d) => hasDay(days, d)).length;


const overlaps = (a: [number, number], b: [number, number]) =>
  [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK].some((s) => a[0] < b[1] + s && b[0] + s < a[1]);

/**
 * Puts one unit (a round trip on some weekdays) on the best aircraft: a type that can fly it and is closest in size to
 * the aircraft measured on the route, at the earliest time the aircraft is free on all those days, keeping the route's
 * flights apart. Returns false when no aircraft has room.
 */
function placeUnit(world: EngineWorld, u: Unit, lines: Line[], specs: Map<string, FlightSpec[]>, seatsWanted: number | null, time: SimTime): boolean {
  const hub = world.airportById.get(u.route.originId)!;
  const own = specs.get(u.route.id) ?? [];
  let best: { line: Line; spec: FlightSpec; score: number } | null = null;
  for (const line of lines) {
    const type = line.type;
    if (checkRoute(world, type, hub, u.dest)) continue;
    // Widebodies stay on long routes, small aircraft on short ones.
    if ((type.category === 'widebody') !== u.long) continue;
    const rt = roundTripHours(type, u.route.distanceKm) * countDays(u.days);
    if (line.hours + rt > WEEKLY_AVAILABLE_HOURS[type.category] + 1e-9) continue;
    const ground = TURNAROUND_MIN[type.category];
    // Long-haul: the usual departure bank (Asia in the afternoon, America late morning); short-haul from 06:00.
    const preferred = u.long ? homeDepartures(1, seedOf(u.dest.id), true, isEastbound(hub, u.dest))[0]! : FIRST_DEP;
    const { out, back } = pairBlocks(world, type.id, u.route);
    // Candidates: around each departure wave (Phase 7.1), and the earliest free time from the preferred one.
    const candidates = [...WAVES.flatMap((w) => [w - 30, w - 20, w - 10, w, w + 10, w + 20, w + 30]), ...range(preferred, LAST_DEP, 5)].filter((d) => d >= FIRST_DEP && d <= LAST_DEP);
    let earliestTaken = false;
    // The evening wave's short-haul flights may also stay the night at the destination and come back for the
    // morning (a night stop), landing before the second wave.
    const nightStop = (dep: number) => {
      const groundMin = Math.round((1440 + WAVES[1]! - ARRIVE_BEFORE_WAVE[0] / 2 - (dep + out + back)) / 5) * 5;
      return !u.long && dep >= WAVES[WAVES.length - 1]! - 20 && groundMin > ground && groundMin < 20 * 60 ? groundMin : null;
    };
    const options = candidates.flatMap((dep) => [{ dep, groundMin: ground }, ...(nightStop(dep) ? [{ dep, groundMin: nightStop(dep)! }] : [])]);
    for (const { dep, groundMin } of options) {
      const isWave = WAVES.some((w) => Math.abs(w - dep) <= 30);
      if (!isWave && earliestTaken) break;
      const spec: FlightSpec = { aircraftId: line.aircraft.id, dep, days: u.days, groundMin };
      // Night curfews at either end (Phase 7.2).
      if (curfewProblem(world, type.id, u.route, spec, time)) continue;
      const busy = busyIntervals(world, type.id, u.route, spec);
      if (busy.some((a) => line.busy.some((b) => overlaps(a, b)))) continue;
      if (!isWave) earliestTaken = true;
      // Size fit (log distance to the measured seats), lateness, spacing from the route's other flights, and the hub's
      // waves: leaving with a departure bank and landing back before the next one, so passengers can connect.
      const fit = seatsWanted ? Math.abs(Math.log(line.aircraft.seats / seatsWanted)) * 300 : 0;
      const gap = own.length ? Math.min(...own.map((o) => Math.min(Math.abs(o.dep - dep), 1440 - Math.abs(o.dep - dep)))) : 1440;
      const score = fit + Math.max(0, dep - preferred) * 0.1 + Math.max(0, ROUTE_SPACING_MIN - gap) * 3 + waveMisfit(dep, dep + out + groundMin + back);
      if (!best || score < best.score) best = { line, spec, score };
    }
  }
  if (!best) return false;
  best.line.busy.push(...busyIntervals(world, best.line.type.id, u.route, best.spec));
  best.line.hours += roundTripHours(best.line.type, u.route.distanceKm) * countDays(u.days);
  specs.set(u.route.id, [...own, best.spec]);
  return true;
}

/** The time a takeover game starts: today (UTC midnight), like a new startup today. */
export const takeoverStart = (now: Date): SimTime => startOfDay(simTime(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));

// Taking over a real airline (Phase 6.2): the player becomes its CEO. The airline keeps its name, codes, colours, its
// real aircraft (registrations from the official registers) and its routes from the hub; the game plans a complete
// timetable on that fleet (real timetables may not be copied, so it is "modelled"). The real airline stops flying as an
// AI airline, and the airlines of its group become partners: they leave its routes alone and feed it passengers.
import { getAircraftType, isFreighter, TURNAROUND_MIN, type AircraftType } from '../data/aircraft';
import { TAKEOVERS, type TakeoverScenario } from '../data/takeovers';
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
import { busyIntervals, freeFlightNumber, setRoutePairs, type FlightSpec } from './schedule';
import type { Aircraft, GameState, Route } from './state';
import { addMonths, MINUTES_PER_DAY, MINUTES_PER_WEEK, simTime, startOfDay, toDate, yearOf, type SimTime } from './time';
import { DAYS_ALL, hasDay, homeDepartures, isEastbound, seedOf, spreadDays } from './timetable';
import { bookCurrencyAt } from './commands';
import { distanceKm } from './geo';
import { newFinance } from './operations';
import type { EngineWorld } from './world';

export type TakeoverError = 'scenarioUnknown' | 'notToday' | 'noRealAirline' | 'alreadyPlaying';

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
  if (state.options.startYear !== undefined) return { ok: false, error: 'notToday' };
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
    partners: groupPartners(world, scenario),
  };
  const airline = state.airlines[id]!;
  airline.liveries = [{ ...defaultLivery(airline.colors, scenario.livery.titles, airline.iata), tail: scenario.livery.tail, logo: { kind: 'none' } }];
  state.finance[id] = newFinance(state.time);
  // A well-known brand: everybody knows it, with a network airline's usual standing.
  state.reputation[id] = { ...newReputation(1), score: MODEL_REPUTATION[real.model] };
  state.ai.airlines[realId] = { status: 'player', health: 0, since: state.time };
  book(state, id, 'capital', convert(money(scenario.cashEur, 'EUR'), currency, state.fx));

  addFleet(state, airline.id, real, scenario, hub);
  const result = addNetwork(state, world, airline.id, real, hub);
  postMessage(state, { airlineId: id, kind: 'takenOver', level: 'info', params: { name: real.name, aircraft: Object.values(state.aircraft).filter((a) => a.airlineId === id && a.status === 'active').length, routes: result.routes } });
  if (result.seasonalSkipped || result.unplanned || result.notFromHub) {
    postMessage(state, { airlineId: id, kind: 'takeoverRoutes', level: 'caution', params: { seasonal: result.seasonalSkipped, unplanned: result.unplanned, other: result.notFromHub } });
  }
  return { ok: true, result: { ...result, airlineId: id } };
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
function weeklyNow(world: EngineWorld, real: RealAirline, hub: Airport, dest: Airport, date: Date): number {
  const out = competitorsOn(world, hub, dest)?.find((c) => c.airlineId === real.id)?.weekly ?? 0;
  const back = competitorsOn(world, dest, hub)?.find((c) => c.airlineId === real.id)?.weekly ?? out;
  return Math.max(1, Math.round(((out + back) / 2) * capacitySeason(hub, dest, date)));
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
const ESTABLISHED_DAYS = 365;

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

function addNetwork(state: GameState, world: EngineWorld, airlineId: string, real: RealAirline, hub: Airport): Omit<TakeoverResult, 'airlineId'> {
  const date = toDate(state.time);
  const fleet = Object.values(state.aircraft).filter((a) => a.airlineId === airlineId && a.status === 'active');
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
    const weekly = weeklyNow(world, real, hub, dest, date);
    const route: Route = {
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
  let unplannedFlights = 0;
  // Long routes first (they need the big aircraft), then each route's first flights, then shorter rotations.
  const seats = (id: string) => world.realAirlines!.observedSeatsPerFlight(hub.id, id);
  // Long-haul = flown with widebodies: measured aircraft size where known (Gran Canaria is far but flown by A320s).
  for (const u of units) u.long = u.route.distanceKm > 4500 || (seats(u.dest.id) ?? 0) > 230;
  units.sort((x, y) => Number(y.long) - Number(x.long) || x.rank - y.rank || y.route.distanceKm - x.route.distanceKm);
  for (const u of units) {
    const placed = placeUnit(world, u, lines, specs, seats(u.dest.id));
    if (!placed) unplannedFlights += countDays(u.days);
  }

  let routes = 0;
  const unplannedRoutes = new Set<string>();
  for (const u of units) if (!specs.has(u.route.id)) unplannedRoutes.add(u.route.id);
  for (const u of units) {
    const list = specs.get(u.route.id);
    if (!list || state.routes[u.route.id]) continue;
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
function placeUnit(world: EngineWorld, u: Unit, lines: Line[], specs: Map<string, FlightSpec[]>, seatsWanted: number | null): boolean {
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
    for (let dep = preferred; dep <= LAST_DEP; dep += 5) {
      const spec: FlightSpec = { aircraftId: line.aircraft.id, dep, days: u.days, groundMin: ground };
      const busy = busyIntervals(world, type.id, u.route, spec);
      if (busy.some((a) => line.busy.some((b) => overlaps(a, b)))) continue;
      // Size fit (log distance to the measured seats), lateness, and spacing from the route's other flights.
      const fit = seatsWanted ? Math.abs(Math.log(line.aircraft.seats / seatsWanted)) * 300 : 0;
      const gap = own.length ? Math.min(...own.map((o) => Math.min(Math.abs(o.dep - dep), 1440 - Math.abs(o.dep - dep)))) : 1440;
      const score = fit + (dep - preferred) * 0.5 + Math.max(0, ROUTE_SPACING_MIN - gap) * 3;
      if (!best || score < best.score) best = { line, spec, score };
      break; // the earliest free time on this aircraft
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

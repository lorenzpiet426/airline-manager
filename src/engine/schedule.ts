// Timetables (Phase 2.2). Every route is flown as "flight pairs": an outbound flight from the hub at a local
// departure time on certain weekdays, a ground time at the destination, and the return flight. In Simple scheduling
// the game plans the pairs itself from the weekly frequency; in Detailed scheduling the player sets every pair.
// Times are hub local time, like published timetables; the airports' time zones turn them into UTC.
import { closureCancelsPair } from './closures';
import { curfewAtTime, hasCurfews } from '../data/curfews';
import { getAircraftType, TURNAROUND_MIN } from '../data/aircraft';
import type { Airport } from '../data/types';
import { nextId } from './core';
import { checkRoute, roundTripHours, WEEKLY_AVAILABLE_HOURS, type PlannedFlight } from './economics';
import type { Aircraft, FlightPair, GameState, Route } from './state';
import { MINUTES_PER_WEEK, startOfDay, utcOffsetMin, weekdayOf, yearOf, type SimTime } from './time';
import { blockMinutes, dayBit, dayCount, DAYS_ALL, hasDay, shiftDays, wrapDay } from './timetable';
import type { EngineWorld } from './world';

/** What the player sets for one flight pair. */
export interface FlightSpec {
  /** Existing pair being changed (keeps its flight number). */
  id?: string;
  aircraftId: string;
  /** Outbound departure, minutes after midnight hub local time (multiple of 5). */
  dep: number;
  /** Weekdays of the outbound departure, bit 0 = Monday. */
  days: number;
  /** Time on the ground at the destination before the return flight (minutes). */
  groundMin: number;
}

export type ScheduleError = 'noFlights' | 'timeInvalid' | 'daysInvalid' | 'groundTooShort' | 'groundTooLong' | 'overlap' | 'aircraftBusy' | 'curfewHub' | 'curfewDestination';

/** Longest planned stay at the destination (a night stop, or a day and a night). */
export const MAX_GROUND_MIN = 36 * 60;

export const pairsOfAircraft = (state: GameState, aircraftId: string) =>
  Object.values(state.flights).filter((p) => p.aircraftId === aircraftId);
export const pairsOfRoute = (state: GameState, routeId: string) =>
  Object.values(state.flights)
    .filter((p) => p.routeId === routeId)
    .sort((a, b) => a.dep - b.dep || a.flightNumber - b.flightNumber);

/** Block times out and back in minutes (wind makes them differ). */
export function pairBlocks(world: EngineWorld, typeId: string, route: Pick<Route, 'originId' | 'destinationId' | 'distanceKm'>) {
  const hub = world.airportById.get(route.originId)!;
  const dest = world.airportById.get(route.destinationId)!;
  const cruise = getAircraftType(typeId).cruiseKmh;
  return { out: blockMinutes(cruise, hub, dest, route.distanceKm), back: blockMinutes(cruise, dest, hub, route.distanceKm) };
}

/** The times of one pair on one day: hub local for the outbound departure and return arrival, destination local in between. */
export interface PairTimes {
  outDep: number;
  outArr: number;
  backDep: number;
  backArr: number;
  /** Minutes from outbound departure to return arrival. */
  span: number;
}

export function pairTimes(world: EngineWorld, typeId: string, route: Route, spec: Pick<FlightSpec, 'dep' | 'groundMin'>, time: SimTime): PairTimes {
  const hub = world.airportById.get(route.originId)!;
  const dest = world.airportById.get(route.destinationId)!;
  const { out, back } = pairBlocks(world, typeId, route);
  const shift = utcOffsetMin(dest.tz, time) - utcOffsetMin(hub.tz, time);
  return {
    outDep: spec.dep,
    outArr: spec.dep + out + shift,
    backDep: spec.dep + out + spec.groundMin + shift,
    backArr: spec.dep + out + spec.groundMin + back,
    span: out + spec.groundMin + back,
  };
}

/**
 * Night curfews (Phase 7.2): does a pair take off or land at either airport while it is closed for the night? The hub's
 * times are its local ones, the destination's its own.
 */
export function curfewProblem(world: EngineWorld, typeId: string, route: Route, spec: Pick<FlightSpec, 'dep' | 'groundMin'>, time: SimTime): 'curfewHub' | 'curfewDestination' | null {
  if (!hasCurfews(route.originId) && !hasCurfews(route.destinationId)) return null;
  const year = yearOf(time);
  const t = pairTimes(world, typeId, route, spec, time);
  const ban = (airportId: string, minute: number) => curfewAtTime(airportId, minute, year)?.kind === 'ban';
  if (ban(route.originId, t.outDep) || ban(route.originId, t.backArr)) return 'curfewHub';
  if (ban(route.destinationId, t.outArr) || ban(route.destinationId, t.backDep)) return 'curfewDestination';
  return null;
}

/** True while the aircraft is in the hangar for a cabin refit (its flights are cancelled). */
export const inRefit = (aircraft: Aircraft, time: SimTime): boolean => (aircraft.refitUntil ?? 0) > time;

/** True while the aircraft can't fly at all: in the hangar for a refit, a maintenance check (4.2) or a repaint (4.3). */
export const grounded = (aircraft: Aircraft, time: SimTime): boolean =>
  inRefit(aircraft, time) || (aircraft.maint?.inCheck?.until ?? 0) > time || (aircraft.paintUntil ?? 0) > time;

/** UTC departure of a pair's outbound flight on the UTC day starting at `day`, or null if it doesn't fly that day. */
export function pairDepartureUtc(world: EngineWorld, route: Route, pair: Pick<FlightPair, 'dep' | 'days'>, day: SimTime): SimTime | null {
  const hub = world.airportById.get(route.originId);
  if (!hub || !hasDay(pair.days, weekdayOf(day))) return null;
  return day + pair.dep - utcOffsetMin(hub.tz, day);
}

/** Is this pair cancelled on the day of `time` because its aircraft is grounded by a technical failure? */
export function aogCancels(world: EngineWorld, route: Route, pair: FlightPair, aircraft: Aircraft, time: SimTime): boolean {
  const aog = aircraft.maint?.aog;
  if (!aog) return false;
  const dep = pairDepartureUtc(world, route, pair, startOfDay(time));
  return dep !== null && dep >= aog.from && dep < aog.until;
}

/**
 * The timetable of a route for the economics model: only aircraft that are flying already (not those still being
 * delivered, unless asked, and not those in a refit).
 */
export function plannedFlights(state: GameState, world: EngineWorld, route: Route, time: SimTime, includeDelivering = false): PlannedFlight[] {
  const result: PlannedFlight[] = [];
  for (const pair of pairsOfRoute(state, route.id)) {
    const aircraft = state.aircraft[pair.aircraftId];
    if (
      !aircraft ||
      (!includeDelivering &&
        (aircraft.status !== 'active' || grounded(aircraft, time) || aogCancels(world, route, pair, aircraft, time) || closureCancelsPair(state, world, route, pair, time)))
    ) {
      continue;
    }
    result.push(...specFlights(world, route, aircraft, yearOf(time) - aircraft.builtYear, pair, time));
  }
  return result;
}

/** The two flights of a pair (outbound in hub local time, return in destination local time). */
export function specFlights(
  world: EngineWorld,
  route: Route,
  aircraft: Pick<Aircraft, 'typeId' | 'seats' | 'cabin'>,
  ageYears: number,
  spec: Pick<FlightSpec, 'dep' | 'days' | 'groundMin'> & { id?: string },
  time: SimTime,
): PlannedFlight[] {
  const times = pairTimes(world, aircraft.typeId, route, spec, time);
  const back = wrapDay(times.backDep);
  const common = { type: getAircraftType(aircraft.typeId), seats: aircraft.seats, cabin: aircraft.cabin, ageYears };
  // Saved flights carry their pair's id (connecting passengers are booked flight by flight, Phase 7.1).
  const key = (dir: 0 | 1) => (spec.id ? { key: `${spec.id}:${dir}` } : {});
  return [
    { dir: 0, days: spec.days, dep: spec.dep, ...common, ...key(0) },
    { dir: 1, days: shiftDays(spec.days, back.shift), dep: back.min, ...common, ...key(1) },
  ];
}

/** Hours per week an aircraft is planned (flying + minimum turnarounds), optionally ignoring one route. */
export function aircraftHours(state: GameState, aircraftId: string, exceptRouteId?: string): number {
  const aircraft = state.aircraft[aircraftId];
  if (!aircraft) return 0;
  const type = getAircraftType(aircraft.typeId);
  return pairsOfAircraft(state, aircraftId)
    .filter((p) => p.routeId !== exceptRouteId)
    .reduce((sum, p) => sum + roundTripHours(type, state.routes[p.routeId]?.distanceKm ?? 0) * dayCount(p.days), 0);
}

/** The time an aircraft is busy with a pair, per weekday: [start, end) in hub local minutes of the week. */
export function busyIntervals(world: EngineWorld, typeId: string, route: Route, spec: Pick<FlightSpec, 'dep' | 'days' | 'groundMin'>): [number, number][] {
  const { out, back } = pairBlocks(world, typeId, route);
  // After landing back at the hub the aircraft needs its turnaround before the next departure.
  const span = out + spec.groundMin + back + TURNAROUND_MIN[getAircraftType(typeId).category];
  const result: [number, number][] = [];
  for (let d = 0; d < 7; d++) if (hasDay(spec.days, d)) result.push([d * 1440 + spec.dep, d * 1440 + spec.dep + span]);
  return result;
}

const overlaps = (a: [number, number], b: [number, number]) =>
  [-MINUTES_PER_WEEK, 0, MINUTES_PER_WEEK].some((s) => a[0] < b[1] + s && b[0] + s < a[1]);

/**
 * Checks a route's complete list of flight pairs (Detailed scheduling). Returns the first problem and the index of
 * the pair it concerns. Pairs of other routes are taken as they are.
 */
export function validateSpecs(
  state: GameState,
  world: EngineWorld,
  route: Route,
  specs: readonly FlightSpec[],
): { error: ScheduleError | 'aircraftUnknown' | 'range' | 'runwayOrigin' | 'runwayDestination' | 'etops'; index: number } | null {
  if (!specs.length) return { error: 'noFlights', index: -1 };
  const hub = world.airportById.get(route.originId)!;
  const dest = world.airportById.get(route.destinationId)!;
  const hours = new Map<string, number>();
  const busy = specs.map((spec) => {
    const aircraft = state.aircraft[spec.aircraftId];
    return aircraft ? busyIntervals(world, aircraft.typeId, route, spec) : [];
  });
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const aircraft = state.aircraft[spec.aircraftId];
    if (!aircraft || aircraft.airlineId !== route.airlineId) return { error: 'aircraftUnknown', index: i };
    if (!Number.isInteger(spec.dep) || spec.dep < 0 || spec.dep >= 1440 || spec.dep % 5 !== 0) return { error: 'timeInvalid', index: i };
    if (!Number.isInteger(spec.days) || spec.days < 1 || spec.days > DAYS_ALL) return { error: 'daysInvalid', index: i };
    const type = getAircraftType(aircraft.typeId);
    if (!Number.isInteger(spec.groundMin) || spec.groundMin < TURNAROUND_MIN[type.category]) return { error: 'groundTooShort', index: i };
    if (spec.groundMin > MAX_GROUND_MIN) return { error: 'groundTooLong', index: i };
    const problem = checkRoute(world, type, hub, dest);
    if (problem) return { error: problem, index: i };
    const curfew = curfewProblem(world, type.id, route, spec, state.time);
    if (curfew) return { error: curfew, index: i };
    // The aircraft can't be in two places: other routes' pairs and this route's other pairs.
    const others = pairsOfAircraft(state, aircraft.id)
      .filter((p) => p.routeId !== route.id)
      .flatMap((p) => {
        const r = state.routes[p.routeId];
        return r ? busyIntervals(world, aircraft.typeId, r, p) : [];
      });
    const mineOther = specs.flatMap((s, j) => (j !== i && s.aircraftId === spec.aircraftId ? busy[j]! : []));
    if (busy[i]!.some((a) => [...others, ...mineOther].some((b) => overlaps(a, b)))) return { error: 'overlap', index: i };
    hours.set(aircraft.id, (hours.get(aircraft.id) ?? aircraftHours(state, aircraft.id, route.id)) + roundTripHours(type, route.distanceKm) * dayCount(spec.days));
    if (hours.get(aircraft.id)! > WEEKLY_AVAILABLE_HOURS[type.category] + 1e-9) return { error: 'aircraftBusy', index: i };
  }
  return null;
}

/** Next free flight number (odd) of an airline, not used by any route or pair. */
export function freeFlightNumber(state: GameState, airlineId: string, from = 101): number {
  const used = new Set<number>();
  for (const r of Object.values(state.routes)) if (r.airlineId === airlineId) used.add(r.flightNumber);
  for (const p of Object.values(state.flights)) if (p.airlineId === airlineId) used.add(p.flightNumber);
  let n = from % 2 === 1 ? from : from + 1;
  while (used.has(n)) n += 2;
  return n;
}

/** Replaces a route's pairs (Detailed scheduling). Existing pairs keep their flight numbers. */
export function setRoutePairs(state: GameState, route: Route, specs: readonly FlightSpec[]): void {
  const old = new Map(pairsOfRoute(state, route.id).map((p) => [p.id, p]));
  for (const id of old.keys()) delete state.flights[id];
  const add = (spec: FlightSpec, id: string, flightNumber: number) =>
    (state.flights[id] = { id, airlineId: route.airlineId, routeId: route.id, aircraftId: spec.aircraftId, flightNumber, dep: spec.dep, days: spec.days, groundMin: spec.groundMin });
  // Kept pairs first (they keep their numbers), then new ones get free numbers.
  for (const spec of specs) {
    const kept = spec.id ? old.get(spec.id) : undefined;
    if (kept) add(spec, kept.id, kept.flightNumber);
  }
  const numbered = new Set(Object.values(state.flights).filter((p) => p.routeId === route.id).map((p) => p.flightNumber));
  for (const spec of specs) {
    if (spec.id && old.has(spec.id)) continue;
    const flightNumber = numbered.has(route.flightNumber) ? freeFlightNumber(state, route.airlineId, route.flightNumber + 2) : route.flightNumber;
    numbered.add(flightNumber);
    add(spec, nextId(state, 'F'), flightNumber);
  }
  syncRoute(state, route);
}

/** Keeps a route's summary fields (frequency, main aircraft) in line with its pairs. */
export function syncRoute(state: GameState, route: Route): void {
  const pairs = pairsOfRoute(state, route.id);
  route.frequency = pairs.reduce((s, p) => s + dayCount(p.days), 0);
  if (pairs[0]) route.aircraftId = pairs[0].aircraftId;
}

// ─── Simple scheduling: the game plans the times ──────────────────────────────────

const FIRST_DEPARTURE = 6 * 60;
const LAST_DEPARTURE = 21 * 60;

/**
 * Plans an aircraft's week from its routes' frequencies (Simple scheduling): round trips one after the other from
 * 06:00 hub time, no departures from the hub after 21:00, routes interleaved so each spreads over the week.
 */
export function autoPlanAircraft(state: GameState, world: EngineWorld, aircraftId: string): void {
  for (const p of pairsOfAircraft(state, aircraftId)) delete state.flights[p.id];
  const aircraft = state.aircraft[aircraftId];
  if (!aircraft) return;
  const routes = Object.values(state.routes)
    .filter((r) => r.aircraftId === aircraftId)
    .sort((a, b) => a.flightNumber - b.flightNumber);
  if (!routes.length) return;
  const turn = TURNAROUND_MIN[getAircraftType(aircraft.typeId).category];

  // Interleave the routes: per pass, a route with three times the frequency of the smallest gets three round trips.
  const queue: Route[] = [];
  const left = new Map(routes.map((r) => [r.id, r.frequency]));
  const smallest = Math.min(...routes.map((r) => r.frequency));
  while ([...left.values()].some((n) => n > 0)) {
    for (const r of routes) {
      const per = Math.max(1, Math.round(r.frequency / smallest));
      for (let i = 0; i < per && left.get(r.id)! > 0; i++) {
        queue.push(r);
        left.set(r.id, left.get(r.id)! - 1);
      }
    }
  }

  // Same route, departure time and ground time on several days = one pair with several weekdays.
  const pairs = new Map<string, { route: Route; dep: number; ground: number; days: number }>();
  let cursor = FIRST_DEPARTURE; // hub local minutes since Monday 00:00
  for (const route of queue) {
    const tod = cursor % 1440;
    if (tod > LAST_DEPARTURE || tod < FIRST_DEPARTURE) {
      // Night stop at the hub: wait for 06:00.
      cursor = (Math.floor(cursor / 1440) + (tod > LAST_DEPARTURE ? 1 : 0)) * 1440 + FIRST_DEPARTURE;
    }
    const { out, back } = pairBlocks(world, aircraft.typeId, route);
    // Night curfews (Phase 7.2): wait until the trip fits, in half-hour steps (at most a day).
    for (let tries = 0; tries < 48 && curfewProblem(world, aircraft.typeId, route, { dep: cursor % 1440, groundMin: turn }, state.time); tries++) cursor += 30;
    const dep = cursor % 1440;
    const day = Math.floor(cursor / 1440) % 7;
    const key = `${route.id}|${dep}`;
    const entry = pairs.get(key) ?? { route, dep, ground: turn, days: 0 };
    entry.days |= dayBit(day);
    pairs.set(key, entry);
    cursor += out + turn + back + turn;
  }
  for (const { route, dep, ground, days } of pairs.values()) {
    const id = nextId(state, 'F');
    state.flights[id] = { id, airlineId: route.airlineId, routeId: route.id, aircraftId, flightNumber: route.flightNumber, dep, days, groundMin: ground };
  }
}

/** Saves from before 2.2 (and Simple games after loading): make sure every route has its pairs. */
export function ensureFlights(state: GameState, world: EngineWorld): void {
  if (state.options.scheduling !== 'simple') return;
  const planned = new Set(Object.values(state.flights).map((p) => p.routeId));
  const missing = new Set(Object.values(state.routes).filter((r) => !planned.has(r.id)).map((r) => r.aircraftId));
  for (const id of missing) autoPlanAircraft(state, world, id);
}

/** Switching a game to Detailed scheduling: the planned pairs stay; each gets its own flight number. */
export function makeDetailed(state: GameState): void {
  state.options.scheduling = 'detailed';
  for (const route of Object.values(state.routes)) {
    pairsOfRoute(state, route.id).forEach((pair, i) => {
      if (i > 0) pair.flightNumber = freeFlightNumber(state, route.airlineId, route.flightNumber + 2);
    });
  }
}

/** Hub of a route as an airport (helper for screens). */
export const hubOf = (world: EngineWorld, route: Route): Airport | undefined => world.airportById.get(route.originId);

export type { FlightPair };

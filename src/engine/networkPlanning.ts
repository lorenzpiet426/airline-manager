// Network planning (Phase 11.1 follow-up): how the head of network reworks the timetable, as real network planners do.
// Every change is a *package*: one or several routes' flights at once (moving a flight, giving it another aircraft,
// trading flights between two aircraft, shifting a whole run of an aircraft's flights, other times on some days, more
// or fewer days, a second daily flight, a bigger aircraft on peak days, swapping aircraft sizes between two routes, and
// before each IATA season a rebuild of flights around a hub wave). Each package is tried on the game and scored for the
// whole station: the routes' own results plus every connecting passenger there (moving one flight changes others'
// connections); then it is put back. Packages are applied all at once or not at all; season packages on the season's
// first day.
import { getAircraftType } from '../data/aircraft';
import { stationOf } from './bases';
import { applyCommand, type CommandResult } from './commands';
import { postMessage } from './core';
import { marketFareUsd, WEEKLY_AVAILABLE_HOURS, roundTripHours } from './economics';
import { routeOutlook } from './managers';
import { aircraftHours, pairsOfAircraft, pairsOfRoute, setRoutePairs, validateSpecs, type FlightSpec } from './schedule';
import { nextSeasonStart, slotsFit } from './slots';
import { freeGates, gatesOf, hubGates } from './hub';
import type { Airline, FlightPair, GameState, Route, TimetableChangeView } from './state';
import { MINUTES_PER_DAY, MINUTES_PER_WEEK, toDate, utcOffsetMin, weekdayOf, type SimTime } from './time';
import { dayCount, DAYS_ALL } from './timetable';
import { playerConnections, routeTransfers } from './transfers';
import type { EngineWorld } from './world';

/** A timetable package: the complete new flights of every route it touches. */
export type Package = Map<string, FlightSpec[]>;

export type PlanKind = 'retime' | 'moveAircraft' | 'tailSwap' | 'chainShift' | 'splitDays' | 'addFlights' | 'peakAircraft' | 'gaugeSwap' | 'cutFlights' | 'waveRebuild';

export interface PlanOption {
  kind: PlanKind;
  pkg: Package;
  /** True effect (USD a week) on the routes' results and the station's connecting passengers. */
  gain: number;
  params: Record<string, string | number>;
}

const SHIFTS = [-120, -60, -30, 30, 60, 120];
const SPLIT_SHIFTS = [-60, 60, 120];
const WEEKEND = (1 << 5) | (1 << 6);
const WORKDAYS = DAYS_ALL & ~WEEKEND;
/** Peak days of leisure and business travel: Friday and Sunday. */
const PEAK = (1 << 4) | (1 << 6);
const DAY_SETS = [DAYS_ALL, WORKDAYS, (1 << 4) | (1 << 5) | (1 << 6)];
const NEW_DEPS = [7 * 60, 13 * 60, 19 * 60];

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const daysText = (days: number) => [0, 1, 2, 3, 4, 5, 6].map((d) => (days & (1 << d) ? String(d + 1) : '·')).join('');

export const specsOf = (state: GameState, routeId: string): FlightSpec[] =>
  pairsOfRoute(state, routeId).map((p) => ({ id: p.id, aircraftId: p.aircraftId, dep: p.dep, days: p.days, groundMin: p.groundMin }));

// ─── Trying a package ───────────────────────────────────────────────────────────

/** Puts a package on the game; returns how to take it back. */
function put(state: GameState, pkg: Package): () => void {
  const saved = new Map<string, { pairs: Record<string, FlightPair>; frequency: number; aircraftId: string }>();
  for (const routeId of pkg.keys()) {
    const route = state.routes[routeId]!;
    saved.set(routeId, { pairs: structuredClone(Object.fromEntries(pairsOfRoute(state, routeId).map((p) => [p.id, p]))), frequency: route.frequency, aircraftId: route.aircraftId });
  }
  const next = state.nextId;
  for (const [routeId, specs] of pkg) setRoutePairs(state, state.routes[routeId]!, specs);
  return () => {
    for (const [routeId, s] of saved) {
      for (const p of pairsOfRoute(state, routeId)) delete state.flights[p.id];
      Object.assign(state.flights, s.pairs);
      const route = state.routes[routeId]!;
      route.frequency = s.frequency;
      route.aircraftId = s.aircraftId;
    }
    state.nextId = next;
  };
}

/** Every route of the package flies a valid timetable once all of it is in place. */
function valid(state: GameState, world: EngineWorld, pkg: Package): boolean {
  for (const routeId of pkg.keys()) {
    const specs = specsOf(state, routeId);
    if (!specs.length || validateSpecs(state, world, state.routes[routeId]!, specs)) return false;
  }
  return pkg.size > 0;
}

/** The package also fits the airports: slots at coordinated airports, enough stands at the stations (a proposal that
 * would be refused when approved is not made). */
function fitsAirports(state: GameState, world: EngineWorld, airline: Airline, pkg: Package): boolean {
  if (!slotsFit(state, world, airline.id)) return false;
  for (const station of new Set([...pkg.keys()].map((id) => state.routes[id]!.originId))) {
    const g = gatesOf(airline, station);
    if (!g) continue;
    if (hubGates(state, world, airline.id, station).peak > g.contact + g.remote + freeGates(state, world, airline.id, station).remote) return false;
  }
  return true;
}

/** A route's result without its connecting passengers (USD a week). */
function local(state: GameState, world: EngineWorld, route: Route): number {
  const o = routeOutlook(state, world, route);
  if (!o) return 0;
  const a = world.airportById.get(route.originId)!;
  const b = world.airportById.get(route.destinationId)!;
  const [out, back] = routeTransfers(world, state, route);
  return o.result - ((out?.pax ?? 0) * (out?.yield ?? 1) + (back?.pax ?? 0) * (back?.yield ?? 1)) * marketFareUsd(world, a, b, toDate(state.time));
}

/** What the connecting passengers at a station bring a week (USD, at their prorated fares). */
function connectionsValue(state: GameState, world: EngineWorld, airline: Airline, station: string): number {
  const date = toDate(state.time);
  let value = 0;
  for (const [routeId, [out, back]] of playerConnections(world, state, airline.id, station).legs) {
    const route = state.routes[routeId];
    const a = route && world.airportById.get(route.originId);
    const b = route && world.airportById.get(route.destinationId);
    if (a && b) value += (out.pax * out.yield + back.pax * back.yield) * marketFareUsd(world, a, b, date);
  }
  return value;
}

/** The score of the routes in the package and their stations, in the game as it is now. */
function score(state: GameState, world: EngineWorld, airline: Airline, routeIds: Iterable<string>): number {
  let s = 0;
  const stations = new Set<string>();
  for (const id of routeIds) {
    const route = state.routes[id]!;
    s += local(state, world, route);
    stations.add(route.originId);
  }
  for (const st of stations) s += connectionsValue(state, world, airline, st);
  return s;
}

/** The package's effect (USD a week), or null when its timetable isn't possible. `base` keeps the scores of today's
 * timetable for the route sets already tried (the game is the same between tries). */
export function tryPackage(state: GameState, world: EngineWorld, airline: Airline, pkg: Package, base = new Map<string, number>()): number | null {
  const key = [...pkg.keys()].sort().join(',');
  const before = base.get(key) ?? base.set(key, score(state, world, airline, pkg.keys())).get(key)!;
  const undo = put(state, pkg);
  try {
    return valid(state, world, pkg) && fitsAirports(state, world, airline, pkg) ? score(state, world, airline, pkg.keys()) - before : null;
  } finally {
    undo();
  }
}

// ─── Applying a package (command UpdateTimetable) ───────────────────────────────

/** Applies a package all at once: if any route's timetable isn't possible, nothing changes. */
export function applyPackage(state: GameState, world: EngineWorld, airlineId: string, routes: { routeId: string; flights: FlightSpec[] }[]): CommandResult {
  if (state.options.scheduling !== 'detailed') return { ok: false, error: 'notDetailed' };
  if (!routes.length || routes.some((r) => state.routes[r.routeId]?.airlineId !== airlineId)) return { ok: false, error: 'routeUnknown' };
  const pkg: Package = new Map(routes.map((r) => [r.routeId, r.flights]));
  const undo = put(state, pkg);
  if (!valid(state, world, pkg)) {
    undo();
    return { ok: false, error: 'overlap' };
  }
  return { ok: true };
}

/** Season packages approved earlier take effect on their day. */
export function plannedTimetablesDailyStep(state: GameState, world: EngineWorld): void {
  for (const airline of Object.values(state.airlines)) {
    if (!airline.plannedTimetables?.length) continue;
    const due = airline.plannedTimetables.filter((p) => p.at <= state.time);
    if (!due.length) continue;
    airline.plannedTimetables = airline.plannedTimetables.filter((p) => p.at > state.time);
    for (const p of due) {
      // Routes closed meanwhile drop out of the package.
      const routes = p.routes.filter((r) => state.routes[r.routeId]);
      const r = routes.length ? applyCommand(state, world, { type: 'UpdateTimetable', airlineId: airline.id, payload: { routes } }) : { ok: false };
      postMessage(state, { airlineId: airline.id, kind: r.ok ? 'timetableApplied' : 'timetableFailed', level: r.ok ? 'info' : 'caution', params: { label: p.label, routes: routes.length } });
    }
  }
}

// ─── The preview ────────────────────────────────────────────────────────────────

/** Every flight the package changes, before and after. */
export function preview(state: GameState, world: EngineWorld, airline: Airline, pkg: Package): TimetableChangeView[] {
  const out: TimetableChangeView[] = [];
  const reg = (id: string) => state.aircraft[id]?.registration ?? id;
  const line = (s: { dep: number; days: number; aircraftId: string }) => `${hhmm(s.dep)} ${daysText(s.days)} ${reg(s.aircraftId)}`;
  for (const [routeId, specs] of pkg) {
    const route = state.routes[routeId]!;
    const name = `${world.airportById.get(route.originId)?.iata ?? route.originId}–${world.airportById.get(route.destinationId)?.iata ?? route.destinationId}`;
    const old = new Map(pairsOfRoute(state, routeId).map((p) => [p.id, p]));
    for (const s of specs) {
      const p = s.id ? old.get(s.id) : undefined;
      if (p && p.dep === s.dep && p.days === s.days && p.aircraftId === s.aircraftId) continue;
      out.push({ route: name, flight: p ? `${airline.iata} ${p.flightNumber}` : `${airline.iata} …`, before: p ? line(p) : '', after: line(s) });
    }
    for (const p of old.values()) if (!specs.some((s) => s.id === p.id)) out.push({ route: name, flight: `${airline.iata} ${p.flightNumber}`, before: line(p), after: '' });
  }
  return out;
}

// ─── Candidates ─────────────────────────────────────────────────────────────────

/** Seat load factor of each weekday (hub local) of a pair's outbound flights over the last 7 days (null = not flown). */
function loadByDay(state: GameState, world: EngineWorld, route: Route, pairId: string): (number | null)[] {
  const offset = utcOffsetMin(world.airportById.get(route.originId)?.tz ?? 'UTC', state.time);
  const sums = Array.from({ length: 7 }, () => ({ pax: 0, seats: 0 }));
  for (const f of state.ops?.history ?? []) {
    if (f.pairId !== pairId || f.dir !== 0 || !f.econ) continue;
    const d = weekdayOf(f.dep + offset);
    sums[d]!.pax += f.econ.pax;
    sums[d]!.seats += f.econ.seats;
  }
  return sums.map((s) => (s.seats > 0 ? s.pax / s.seats : null));
}

const sameCategory = (state: GameState, a: string, b: string) =>
  getAircraftType(state.aircraft[a]!.typeId).category === getAircraftType(state.aircraft[b]!.typeId).category;

/** Other aircraft of the airline stationed at the route's origin (same category, or bigger ones). */
function stationFleet(state: GameState, airline: Airline, route: Route, except: string): string[] {
  return Object.values(state.aircraft)
    .filter((x) => x.airlineId === airline.id && x.status === 'active' && x.id !== except && stationOf(airline, x) === route.originId)
    .map((x) => x.id);
}

/** The route-level options for one route of the network: times, aircraft, days, flights. */
export function routeOptions(state: GameState, world: EngineWorld, airline: Airline, route: Route, load: number | null): PlanOption[] {
  const options: PlanOption[] = [];
  const base = new Map<string, number>();
  const pairs = pairsOfRoute(state, route.id).sort((x, y) => x.dep - y.dep);
  const specs = specsOf(state, route.id);
  const name = `${world.airportById.get(route.originId)?.iata ?? ''}–${world.airportById.get(route.destinationId)?.iata ?? ''}`;
  const add = (kind: PlanKind, pkg: Package, params: Record<string, string | number>) => {
    const gain = tryPackage(state, world, airline, pkg, base);
    if (gain !== null) options.push({ kind, pkg, gain, params: { route: name, ...params } });
  };
  const withPair = (pairId: string, change: Partial<FlightSpec>) => specs.map((s) => (s.id === pairId ? { ...s, ...change } : s));
  const fleet = stationFleet(state, airline, route, '');

  for (const p of pairs.slice(0, 2)) {
    const flight = `${airline.iata} ${p.flightNumber}`;
    const others = fleet.filter((id) => id !== p.aircraftId && sameCategory(state, id, p.aircraftId));
    // a) Another time (on its own aircraft, else another one that's free, else trading with the one that's busy, else
    //    moving the aircraft's following/preceding flights along).
    for (const shift of SHIFTS) {
      const dep = p.dep + shift;
      if (dep < 4 * 60 + 30 || dep > 23 * 60 + 30) continue;
      const own: Package = new Map([[route.id, withPair(p.id, { dep })]]);
      const before = options.length;
      add('retime', own, { flight, from: hhmm(p.dep), to: hhmm(dep) });
      if (options.length > before) continue;
      let placed = false;
      for (const other of others.slice(0, 3)) {
        const moved: Package = new Map([[route.id, withPair(p.id, { dep, aircraftId: other })]]);
        const n = options.length;
        add('moveAircraft', moved, { flight, from: hhmm(p.dep), to: hhmm(dep), registration: state.aircraft[other]!.registration });
        if (options.length > n) {
          placed = true;
          break;
        }
        // Tail swap: the other aircraft's flight at that time takes this flight's aircraft instead.
        const clash = pairsOfAircraft(state, other).find((q) => q.routeId !== route.id && q.days & p.days && Math.abs(q.dep - dep) < 4 * 60);
        if (clash) {
          const swap: Package = new Map([[route.id, withPair(p.id, { dep, aircraftId: other })]]);
          const qSpecs = specsOf(state, clash.routeId).map((s) => (s.id === clash.id ? { ...s, aircraftId: p.aircraftId } : s));
          swap.set(clash.routeId, qSpecs);
          const m = options.length;
          add('tailSwap', swap, { flight, from: hhmm(p.dep), to: hhmm(dep) });
          if (options.length > m) {
            placed = true;
            break;
          }
        }
      }
      if (placed) continue;
      // Chain shift: the aircraft's flights after (later) or before (earlier) this one move by the same time.
      const chain = pairsOfAircraft(state, p.aircraftId).filter((q) => q.days & p.days && (shift > 0 ? q.dep >= p.dep : q.dep <= p.dep)).slice(0, 4);
      if (chain.length > 1 && chain.every((q) => q.dep + shift >= 4 * 60 + 30 && q.dep + shift <= 23 * 60 + 30)) {
        const pkg: Package = new Map();
        for (const q of chain) {
          const list = pkg.get(q.routeId) ?? specsOf(state, q.routeId);
          pkg.set(q.routeId, list.map((s) => (s.id === q.id ? { ...s, dep: s.dep + shift } : s)));
        }
        add('chainShift', pkg, { flight, from: hhmm(p.dep), to: hhmm(dep), count: chain.length });
      }
    }
    // b) Other times on some days: the weekend (or the weekdays) at another time (same aircraft).
    if (dayCount(p.days) >= 5) {
      for (const part of [p.days & WEEKEND]) {
        if (!part || part === p.days) continue;
        for (const shift of SPLIT_SHIFTS) {
          const dep = p.dep + shift;
          if (dep < 4 * 60 + 30 || dep > 23 * 60 + 30) continue;
          const list = [...withPair(p.id, { days: p.days & ~part }), { aircraftId: p.aircraftId, dep, days: part, groundMin: p.groundMin }];
          add('splitDays', new Map([[route.id, list]]), { flight, days: daysText(part), from: hhmm(p.dep), to: hhmm(dep) });
        }
      }
    }
  }

  const byDay = pairs.map((p) => loadByDay(state, world, route, p.id));
  // c) Full: more days, another daily (or weekday/weekend) flight, a bigger aircraft on peak days or for good.
  if (load !== null && load >= 0.85) {
    pairs.slice(0, 1).forEach((p) => {
      for (let d = 0; d < 7; d++) if (!(p.days & (1 << d))) add('addFlights', new Map([[route.id, withPair(p.id, { days: p.days | (1 << d) })]]), { count: 1 });
    });
    const type = getAircraftType(state.aircraft[pairs[0]?.aircraftId ?? '']?.typeId ?? 'A20N');
    const spare = fleet
      .filter((id) => getAircraftType(state.aircraft[id]!.typeId).category === type.category)
      .map((id) => ({ id, free: WEEKLY_AVAILABLE_HOURS[type.category] - aircraftHours(state, id) }))
      .filter((s) => s.free >= roundTripHours(getAircraftType(state.aircraft[s.id]!.typeId), route.distanceKm) * 3)
      .sort((x, y) => y.free - x.free)[0];
    if (spare) {
      for (const days of DAY_SETS) {
        for (const dep of NEW_DEPS) {
          const list = [...specs, { aircraftId: spare.id, dep, days, groundMin: pairs[0]?.groundMin ?? 45 }];
          add('addFlights', new Map([[route.id, list]]), { count: dayCount(days) });
        }
      }
    }
    for (const p of pairs.slice(0, 2)) {
      const seats = state.aircraft[p.aircraftId]!.seats;
      const bigger = fleet.filter((id) => state.aircraft[id]!.seats > seats * 1.15).slice(0, 3);
      for (const big of bigger) {
        // On peak days only: the bigger aircraft flies Friday and Sunday at the same time.
        const peak = p.days & PEAK;
        if (peak && peak !== p.days) {
          const list = [...withPair(p.id, { days: p.days & ~peak }), { aircraftId: big, dep: p.dep, days: peak, groundMin: p.groundMin }];
          add('peakAircraft', new Map([[route.id, list]]), { flight: `${airline.iata} ${p.flightNumber}`, registration: state.aircraft[big]!.registration });
        }
        // Gauge swap: a flight of the bigger aircraft on a quieter route trades aircraft with this one.
        const q = pairsOfAircraft(state, big).find((x) => x.routeId !== route.id && Math.abs(x.dep - p.dep) <= 90 && (x.days & p.days) === p.days);
        if (q) {
          const swap: Package = new Map([[route.id, withPair(p.id, { aircraftId: big })]]);
          swap.set(q.routeId, specsOf(state, q.routeId).map((s) => (s.id === q.id ? { ...s, aircraftId: p.aircraftId } : s)));
          add('gaugeSwap', swap, { flight: `${airline.iata} ${p.flightNumber}`, registration: state.aircraft[big]!.registration });
        }
      }
    }
  }
  // d) Empty: the weakest days (from the last week's flights), the weekend or weekdays only, or one flight less.
  if (load !== null && load <= 0.6) {
    pairs.slice(0, 2).forEach((p, i) => {
      const flown = [0, 1, 2, 3, 4, 5, 6].filter((d) => p.days & (1 << d));
      if (flown.length <= 1) return;
      const days = byDay[i]!;
      const weakest = [...flown].sort((x, y) => (days[x] ?? 0.7) - (days[y] ?? 0.7));
      const sets = [1 << weakest[0]!, (1 << weakest[0]!) | (1 << (weakest[1] ?? weakest[0]!)), p.days & WEEKEND, p.days & ~((1 << 4) | (1 << 5) | (1 << 6))];
      for (const cut of new Set(sets)) {
        if (!cut || cut === p.days) continue;
        add('cutFlights', new Map([[route.id, withPair(p.id, { days: p.days & ~cut })]]), { count: dayCount(cut) });
      }
      if (pairs.length > 1) add('cutFlights', new Map([[route.id, specs.filter((s) => s.id !== p.id)]]), { count: dayCount(p.days) });
    });
  }
  return options;
}

/**
 * Before a season: the flights around a hub wave planned together. Greedily, each of the station's flights with the
 * fewest connecting passengers is moved (±30/60 min, on its own aircraft) while that makes the whole station better.
 */
export function waveRebuild(state: GameState, world: EngineWorld, airline: Airline, station: string, flights = 8): PlanOption | null {
  const conn = playerConnections(world, state, airline.id, station);
  const transferOf = (p: FlightPair) => (conn.legs.get(p.routeId)?.[0].perFlight?.get(`${p.id}:0`) ?? []).reduce((a, b) => a + b, 0) / Math.max(1, dayCount(p.days));
  const candidates = Object.values(state.flights)
    .filter((p) => p.airlineId === airline.id && state.routes[p.routeId]?.originId === station && p.dep >= 6 * 60 && p.dep <= 22 * 60)
    .sort((x, y) => transferOf(x) - transferOf(y))
    .slice(0, flights);
  if (candidates.length < 2) return null;
  const pkg: Package = new Map();
  const base = new Map<string, number>();
  let total = 0;
  for (let round = 0; round < 1; round++) {
    for (const p of candidates) {
      let best: { pkg: Package; gain: number } | null = null;
      for (const shift of [-60, -30, 30, 60]) {
        const current = pkg.get(p.routeId) ?? specsOf(state, p.routeId);
        const spec = current.find((s) => s.id === p.id);
        if (!spec || spec.dep + shift < 4 * 60 + 30 || spec.dep + shift > 23 * 60 + 30) continue;
        const next: Package = new Map(pkg);
        next.set(p.routeId, current.map((s) => (s.id === p.id ? { ...s, dep: s.dep + shift } : s)));
        // The effect of the whole package so far against today's timetable.
        const gain = tryPackage(state, world, airline, next, base);
        if (gain !== null && gain > total + 50 && (!best || gain > best.gain)) best = { pkg: next, gain };
      }
      if (best) {
        for (const [k, v] of best.pkg) pkg.set(k, v);
        total = best.gain;
      }
    }
  }
  if (!pkg.size) return null;
  return { kind: 'waveRebuild', pkg, gain: total, params: { station: world.airportById.get(station)?.iata ?? station, count: preview(state, world, airline, pkg).length } };
}

/** The start of the next IATA season, if it is close enough to plan for it now (within 10 weeks). */
export function seasonAhead(time: SimTime): SimTime | null {
  const next = nextSeasonStart(time);
  return next - time <= 10 * MINUTES_PER_WEEK && next - time > 2 * MINUTES_PER_DAY ? next : null;
}

// The real airlines come alive (Phase 2.1b, "whole world, simplified"). Every airline reviews its network once a
// month (spread over the days so the game never stalls) and reacts according to its type:
//   low-cost  – matches or undercuts your fares at once, enters profitable routes from its bases, quits quickly;
//   network   – matches part of a price cut, adds flights to defend hub routes, keeps routes longer;
//   home rival (network airline at your hub) – defends hardest;
//   regional / charter – react little.
// Our economics model is an approximation, so the AI judges *changes* against the real starting point: a real
// route is only given up when it has become clearly worse than in reality (e.g. because of you) and loses money.
import { conditionsOf } from './worldEvents';
import { regulatedRange } from '../data/eras';
import { AIRCRAFT_TYPES, getAircraftType, isFreighter, isInService, type AircraftType } from '../data/aircraft';
import type { Airport } from '../data/types';
import { postMessage } from './core';
import {
  aiRouteKey,
  capacitySeason,
  competitorsOn,
  crewCostPerDayUsd,
  market,
  MODEL_FARE,
  routeWeek,
  totalCosts,
  WEEKLY_AVAILABLE_HOURS,
  type RouteContext,
  type RouteCosts,
} from './economics';
import { haul, MODEL_REPUTATION, modelCabin, totalSeats } from './cabins';
import { typicalRentUsd } from './market';
import { fleetSize, type BusinessModel, type RealAirline } from './realAirlines';
import { random } from './rng';
import { networkChanged, realLegTransfers } from './transfers';
import { plannedFlights } from './schedule';
import type { AiRouteState, CabinLayout, GameState } from './state';
import { MINUTES_PER_DAY, toDate, yearOf } from './time';
import type { EngineWorld } from './world';

export interface Behaviour {
  /** Share of the player's price cut the airline follows (1 = matches fully). */
  priceMatch: number;
  /** Low-cost airlines go a little below the player's fare. */
  undercut: number;
  /** Monthly reviews with clear losses before frequencies are cut (and the route is finally given up). */
  exitAfter: number;
  /** Extra flights added (share) when the player attacks a route at the airline's hub or base. */
  defend: number;
  /** Monthly chance to enter one of the player's profitable routes from a hub/base. */
  entryChance: number;
  /** Monthly chance to open a new route somewhere in its network. */
  growChance: number;
}

export const BEHAVIOUR: Record<BusinessModel, Behaviour> = {
  lowcost: { priceMatch: 1, undercut: 0.03, exitAfter: 2, defend: 0.15, entryChance: 0.3, growChance: 0.3 },
  legacy: { priceMatch: 0.5, undercut: 0, exitAfter: 4, defend: 0.25, entryChance: 0.1, growChance: 0.12 },
  regional: { priceMatch: 0.3, undercut: 0, exitAfter: 3, defend: 0.1, entryChance: 0.05, growChance: 0.06 },
  charter: { priceMatch: 0, undercut: 0, exitAfter: 2, defend: 0, entryChance: 0.08, growChance: 0.1 },
};

/** The network airline based at the player's hub fights harder for "its" airport. */
const HOME_RIVAL: Partial<Behaviour> = { priceMatch: 0.8, defend: 0.4, entryChance: 0.3 };

const REVIEW_CYCLE_DAYS = 28;
const MAX_WORLD_NEWS_PER_DAY = 2;
const FARE_FLOOR = 0.5;

export function behaviourOf(airline: RealAirline, playerHubs: ReadonlySet<string>): Behaviour {
  const b = BEHAVIOUR[airline.model];
  const home = airline.model === 'legacy' && airline.hubs.some((h) => playerHubs.has(h));
  return home ? { ...b, ...HOME_RIVAL } : b;
}

/** Notable airlines make world news (big fleets). */
const notable = (a: RealAirline) => Math.max(fleetSize(a), a.registered.length) >= 60;

// ─── The airline's current network ──────────────────────────────────────────────

export interface AiRoute {
  key: string;
  a: string;
  b: string;
  weeklyAB: number;
  weeklyBA: number;
  fare: number;
  seasonal: boolean;
  added: boolean;
}

/** An airline's routes as they are now in this game: real routes (minus closed ones) plus routes it opened. */
export function currentRoutes(world: EngineWorld, state: GameState, airline: RealAirline): AiRoute[] {
  const real = world.realAirlines!;
  if (state.ai.airlines[airline.id]?.status === 'bankrupt') return [];
  const out: AiRoute[] = [];
  const seen = new Set<string>();
  const pairs = [
    ...real.routesOf(airline.id).map((r) => ({ a: r.a, b: r.b, seasonal: r.seasonal, added: false })),
    ...Object.entries(state.ai.routes)
      .filter(([key, r]) => r.added && key.startsWith(`${airline.id}|`))
      .map(([key]) => {
        const [, a, b] = key.split('|') as [string, string, string];
        return { a, b, seasonal: false, added: true };
      }),
  ];
  for (const p of pairs) {
    const key = aiRouteKey(airline.id, p.a, p.b);
    if (seen.has(key) || state.ai.routes[key]?.closed) continue;
    seen.add(key);
    const A = world.airportById.get(p.a);
    const B = world.airportById.get(p.b);
    if (!A || !B) continue;
    const ab = competitorsOn(world, A, B, undefined, state.ai)?.find((c) => c.airlineId === airline.id);
    const ba = competitorsOn(world, B, A, undefined, state.ai)?.find((c) => c.airlineId === airline.id);
    if (!ab && !ba) continue;
    out.push({ key, a: p.a, b: p.b, weeklyAB: ab?.weekly ?? 0, weeklyBA: ba?.weekly ?? 0, fare: ab?.fareFactor ?? MODEL_FARE[airline.model], seasonal: p.seasonal, added: p.added });
  }
  return out;
}

// ─── An airline's view of one route ─────────────────────────────────────────────

/** The most common passenger type of a year that can fly the distance (for modelled carriers without a fleet list). */
const eraTypes = new Map<string, AircraftType | null>();
function typicalTypeOf(km: number, year: number): AircraftType | null {
  const band = km < 2500 ? 0 : km < 5000 ? 1 : km < 9000 ? 2 : 3;
  const key = `${band}|${year}`;
  if (!eraTypes.has(key)) {
    const need = [2500, 5000, 9000, 15000][band]!;
    const pick = AIRCRAFT_TYPES.filter(
      (t) => !isFreighter(t) && isInService(t, year) && t.rangeKm >= need * 1.05 && t.category !== 'turboprop' && (band === 0) === (t.category !== 'widebody'),
    ).sort((x, y) => y.fleetWeight - x.fleetWeight)[0];
    eraTypes.set(key, pick ?? null);
  }
  return eraTypes.get(key) ?? null;
}

/** The aircraft an airline would use: its most common type that can fly the distance. */
export function aircraftFor(airline: RealAirline, km: number, year: number, seatsWanted: number | null = null): { type: AircraftType; seats: number } | null {
  const seatsOf = (x: { f: (typeof airline.fleet)[number]; type: AircraftType }) => x.f.seats ?? x.type.seats.typical;
  const usable = airline.fleet
    .map((f) => ({ f, type: safeType(f.type) }))
    .filter((x): x is { f: (typeof airline.fleet)[number]; type: AircraftType } => !!x.type && !isFreighter(x.type) && x.type.rangeKm >= km * 1.05)
    // The type closest in size to the aircraft measured on the route, else the most common one.
    .sort((x, y) => (seatsWanted ? Math.abs(Math.log(seatsOf(x) / seatsWanted)) - Math.abs(Math.log(seatsOf(y) / seatsWanted)) : 0) || y.f.inService - x.f.inService);
  if (usable[0]) return { type: usable[0].type, seats: seatsOf(usable[0]) };
  if (airline.modelled) {
    const type = typicalTypeOf(km, year);
    return type ? { type, seats: type.seats.typical } : null;
  }
  const fallback = getAircraftType(km < 4000 ? 'A320' : km < 9000 ? 'B789' : 'A359');
  return fallback.rangeKm >= km ? { type: fallback, seats: fallback.seats.typical } : null;
}

function safeType(id: string): AircraftType | null {
  try {
    return getAircraftType(id);
  } catch {
    return null;
  }
}

interface Evaluation {
  margin: number;
  profit: number;
  revenue: number;
  loadFactor: number;
  pax: number;
  seats: number;
  km: number;
  flights: number;
  costs: RouteCosts;
  /** Crew and aircraft ownership (lease) for the hours flown. */
  aircraftCosts: number;
}

/**
 * How an airline type's costs differ from the network carriers' the cost model is built on (Phase 6.1, calibrated to
 * Ryanair's and Wizz Air's annual reports): low-cost airlines use cheaper secondary airports and negotiate discounts,
 * do much of their own handling, fly young aircraft and sell almost only on their own website.
 */
const COST_PROFILE: Record<BusinessModel, Partial<Record<keyof RouteCosts, number>>> = {
  legacy: {},
  regional: {},
  charter: { distribution: 0.5, handling: 0.85 },
  lowcost: { airport: 0.5, handling: 0.6, maintenance: 0.6, distribution: 0.2, service: 0.3 },
};

/** Weekly result of the airline on a route, including its aircraft costs (crew, lease). */
export function evaluate(world: EngineWorld, state: GameState, airline: RealAirline, A: Airport, B: Airport, weekly: number, fare: number, extra: RouteContext['extra'], date: Date, withChanges: boolean): Evaluation | null {
  const km = market(world, A, B).distanceKm;
  const ac = aircraftFor(airline, km, date.getUTCFullYear(), world.realAirlines?.observedSeatsPerFlight(A.id, B.id) ?? null);
  const conditions = conditionsOf(state, world);
  if (!ac || weekly <= 0) return null;
  // The frequencies are the summer schedule; quiet months see fewer flights.
  weekly *= capacitySeason(A, B, date);
  const cabin = airlineCabin(ac.type, airline.model, km, ac.seats);
  // Network airlines also carry passengers changing planes at their hub (Phase 6.1).
  const transfer = realLegTransfers(world, airline, A.id, B.id, withChanges ? state.ai : undefined);
  const w = routeWeek(
    world,
    A,
    B,
    { type: ac.type, seats: totalSeats(cabin), cabin, frequency: weekly, fareFactor: fare, classFares: { W: fare, J: fare, F: fare }, ageYears: 10, rampUp: 1 },
    date,
    // Both sums (today and the real starting point) see the same world (fuel, recessions, pandemics), so an AI airline
    // compares like with like and only reacts to the competition.
    { ai: withChanges ? state.ai : undefined, exclude: airline.id, extra, brand: { reputation: MODEL_REPUTATION[airline.model], awareness: 1 }, conditions, transfer: [transfer, transfer] },
  );
  const ownPerBlockHour =
    ((crewCostPerDayUsd(world, ac.type, ac.seats, airline.country ?? 'US') * conditions.levels.costs) * 7 + (typicalRentUsd(ac.type, 10, date.getUTCFullYear()) * 12) / 52) /
    (WEEKLY_AVAILABLE_HOURS[ac.type.category] * 0.75);
  const profile = COST_PROFILE[airline.model];
  const costs = Object.fromEntries(Object.entries(w.costs).map(([k, v]) => [k, v * (profile[k as keyof RouteCosts] ?? 1)])) as unknown as RouteCosts;
  const profit = w.revenue - totalCosts(costs) - w.blockHours * ownPerBlockHour;
  return { margin: profit / Math.max(1, w.revenue), profit, revenue: w.revenue, loadFactor: w.loadFactor, pax: w.pax, seats: w.seats, km, flights: w.flights, costs, aircraftCosts: w.blockHours * ownPerBlockHour };
}

/** The airline type's usual cabin on this aircraft, with the seat total from its fleet list where known. */
function airlineCabin(type: AircraftType, model: RealAirline['model'], km: number, seats: number): CabinLayout {
  const cabin = modelCabin(type, model, haul(km) >= 0.5);
  const premium = totalSeats(cabin.filter((s) => s.cls !== 'Y'));
  const y = cabin.find((s) => s.cls === 'Y');
  if (!y || seats <= premium || seats > type.seats.max) return cabin;
  return cabin.map((s) => (s === y ? { ...s, seats: seats - premium } : s));
}

/** The player's flights on a route, as competitors for the AI. */
function playerSuppliers(state: GameState, world: EngineWorld, a: string, b: string): NonNullable<RouteContext['extra']> {
  return Object.values(state.routes)
    .filter((r) => (r.originId === a && r.destinationId === b) || (r.originId === b && r.destinationId === a))
    .flatMap((r) => {
      // The player's real timetable and cabins, seen from airport a.
      const flights = plannedFlights(state, world, r, state.time).map((f) => ({ dir: (r.originId === a ? f.dir : 1 - f.dir) as 0 | 1, days: f.days, dep: f.dep, cabin: f.cabin }));
      const rep = state.reputation[r.airlineId];
      const brand = rep ? { reputation: rep.score, awareness: rep.awareness } : undefined;
      return flights.length ? [{ weekly: r.frequency, fareFactor: r.fareFactor, classFares: r.classFares, flights, brand }] : [];
    });
}

// ─── Daily AI step ──────────────────────────────────────────────────────────────

const reviewDay = new Map<string, number>();
function dayOf(id: string): number {
  let d = reviewDay.get(id);
  if (d === undefined) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    d = h % REVIEW_CYCLE_DAYS;
    reviewDay.set(id, d);
  }
  return d;
}

interface Ctx {
  world: EngineWorld;
  state: GameState;
  date: Date;
  playerHubs: Set<string>;
  playerId: string | null;
  /** Airport pairs the player flies ("A|B"). */
  playerPairs: Set<string>;
  /** Routes an airline opened during the game: [A, B]. */
  addedBy: (airline: string) => [string, string][];
  news: number;
}

const code = (ctx: Ctx, id: string) => ctx.world.airportById.get(id)?.iata ?? id;

function message(ctx: Ctx, kind: Parameters<typeof postMessage>[1]['kind'], toPlayer: boolean, params: Record<string, string | number>) {
  if (toPlayer && ctx.playerId) {
    postMessage(ctx.state, { airlineId: ctx.playerId, kind, level: 'caution', params });
  } else if (ctx.news < MAX_WORLD_NEWS_PER_DAY) {
    ctx.news++;
    postMessage(ctx.state, { airlineId: null, kind, level: 'info', params });
  }
}

/** Called once a day: the airlines due for their monthly review today, plus (on the 1st) entries into the player's routes. */
export function aiDailyStep(state: GameState, world: EngineWorld): void {
  const real = world.realAirlines;
  if (!real) return;
  const player = Object.values(state.airlines).find((a) => a.controller === 'human') ?? null;
  const ctx: Ctx = {
    world,
    state,
    date: toDate(state.time - 1),
    playerHubs: new Set(player ? [player.hubId] : []),
    playerId: player?.id ?? null,
    playerPairs: new Set(
      Object.values(state.routes).map((r) => (r.originId < r.destinationId ? `${r.originId}|${r.destinationId}` : `${r.destinationId}|${r.originId}`)),
    ),
    addedBy: (() => {
      const map = new Map<string, [string, string][]>();
      for (const [key, r] of Object.entries(state.ai.routes)) {
        if (!r.added) continue;
        const [airline, a, b] = key.split('|') as [string, string, string];
        map.set(airline, [...(map.get(airline) ?? []), [a, b]]);
      }
      return (airline: string) => map.get(airline) ?? [];
    })(),
    news: 0,
  };
  const day = Math.floor(state.time / MINUTES_PER_DAY) % REVIEW_CYCLE_DAYS;
  for (const airline of [...real.byId.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    if (dayOf(airline.id) === day) {
      reviewAirline(ctx, airline);
      // Its routes, frequencies or survival may have changed: transfer passengers at its hubs follow (Phase 6.1).
      networkChanged(state.ai, airline.id);
    }
  }
  if (toDate(state.time).getUTCDate() === 1) watchPlayerRoutes(ctx);
}

/** Rough weekly revenue of an airline's whole real network (USD), for judging how much a change hurts it. */
const networkRevenueCache = new Map<string, number>();
function networkRevenue(world: EngineWorld, airline: RealAirline): number {
  let total = networkRevenueCache.get(airline.id);
  if (total === undefined) {
    total = 0;
    for (const r of world.realAirlines!.routesOf(airline.id)) {
      const A = world.airportById.get(r.a);
      const B = world.airportById.get(r.b);
      if (!A || !B) continue;
      const weekly = ((r.weeklyAB ?? 3) + (r.weeklyBA ?? 3)) / 2;
      total += weekly * 2 * 150 * 0.8 * (60 + 0.13 * market(world, A, B).distanceKm ** 0.92);
    }
    networkRevenueCache.set(airline.id, Math.max(total, 1));
  }
  return total;
}

/** Frequencies of a real route without official numbers (the demand model's estimate, as in competitorsOn). */
function weeklyOf(world: EngineWorld, state: GameState, airline: RealAirline, A: Airport, B: Airport): number {
  return competitorsOn(world, A, B, undefined, state.ai)?.find((c) => c.airlineId === airline.id)?.weekly ?? 0;
}

function reviewAirline(ctx: Ctx, airline: RealAirline): void {
  const { state, world } = ctx;
  const status = (state.ai.airlines[airline.id] ??= { status: 'active', health: 0 });
  if (status.status === 'bankrupt') return;
  const b = behaviourOf(airline, ctx.playerHubs);
  const bases = new Set([...airline.hubs, ...airline.bases]);
  let delta = 0; // profit change against the real starting point, on affected routes
  let affectedRevenue = 0;
  let affectedProfit = 0;

  // Only routes where something differs from reality need a review: the player flies there, the AI changed the
  // route, another airline entered the pair, or the airline opened it during the game. Untouched routes stay as
  // they are in the real-world data (that keeps the world stable and the game fast).
  const routes = [
    ...world.realAirlines!.routesOf(airline.id).map((r) => ({ a: r.a, b: r.b, added: false })),
    ...ctx.addedBy(airline.id).map(([a, b2]) => ({ a, b: b2, added: true })),
  ];
  for (const r of routes) {
    const key = aiRouteKey(airline.id, r.a, r.b);
    const change = state.ai.routes[key];
    if (change?.closed) continue;
    const pair = r.a < r.b ? `${r.a}|${r.b}` : `${r.b}|${r.a}`;
    const players = ctx.playerPairs.has(pair) ? playerSuppliers(state, world, r.a, r.b) : [];
    if (!change && !players.length && !state.ai.added[pair]) continue;
    const A = world.airportById.get(r.a);
    const B = world.airportById.get(r.b);
    if (!A || !B) continue;
    const weeklyAB = change ? change.weeklyAB : weeklyOf(world, state, airline, A, B);
    const weeklyBA = change ? change.weeklyBA : weeklyOf(world, state, airline, B, A);
    const fare = change?.fare ?? MODEL_FARE[airline.model];
    const weekly = (weeklyAB + weeklyBA) / 2;
    const now = evaluate(world, state, airline, A, B, weekly, fare, players, ctx.date, true);
    if (!now) continue;
    // The real-world starting point of this route (no player, no AI changes): what "normal" looks like here.
    const base = r.added ? null : evaluate(world, state, airline, A, B, weekly, MODEL_FARE[airline.model], [], ctx.date, false);
    // Health counts how much the airline's *real* routes suffered; a new route that doesn't work is simply dropped.
    if (base) delta += now.profit - base.profit;
    affectedRevenue += now.revenue;
    affectedProfit += now.profit;
    const edit = (): AiRouteState => (state.ai.routes[key] ??= { weeklyAB, weeklyBA, fare, badReviews: 0, since: state.time });
    // Name the route from the player's hub, otherwise from the airline's own base (VIE–ATH, not ATH–VIE).
    const flip = ctx.playerHubs.has(r.b) || (!ctx.playerHubs.has(r.a) && bases.has(r.b) && !bases.has(r.a));
    const from = code(ctx, flip ? r.b : r.a);
    const to = code(ctx, flip ? r.a : r.b);

    if (players.length) {
      // a) Price: follow the player's cut (low-cost: go just below it).
      const playerFare = Math.min(...players.map((p) => p.fareFactor));
      if (playerFare < fare - 0.01 && b.priceMatch > 0) {
        let target = fare - b.priceMatch * (fare - playerFare);
        if (b.undercut > 0) target = playerFare * (1 - b.undercut);
        target = Math.max(FARE_FLOOR, Math.round(target * 100) / 100);
        // Before deregulation fares were fixed: no price wars, only the small discounts the tariff allowed.
        const regulated = regulatedRange(A.country, B.country, ctx.date);
        if (regulated) target = Math.max(target, regulated[0]);
        if (fare - target >= 0.03) {
          edit().fare = target;
          message(ctx, 'aiFare', true, { airline: airline.name, from, to, value: Math.round((target / fare - 1) * 100) });
        }
      }
      // b) Defend a hub/base route with more flights (once).
      if (b.defend > 0 && !change?.defended && (bases.has(r.a) || bases.has(r.b))) {
        const e = edit();
        const more = Math.max(1, Math.round(weekly * b.defend));
        e.weeklyAB = weeklyAB + more;
        e.weeklyBA = weeklyBA + more;
        e.defended = true;
        message(ctx, 'aiFrequency', true, { airline: airline.name, from, to, value: more });
      }
    } else if (change && change.fare < MODEL_FARE[airline.model] - 0.01) {
      // Price war over: fares slowly return to normal.
      change.fare = Math.min(MODEL_FARE[airline.model], change.fare + 0.05);
    }

    // c) Losing money and clearly worse than the real starting point (or a new route that doesn't work) → fewer
    //    flights, and after a while the airline gives the route up.
    const worse = now.margin < -0.05 && (base ? now.margin < base.margin - 0.12 : true);
    if (worse) {
      const e = edit();
      e.badReviews++;
      if (e.badReviews >= b.exitAfter) {
        e.badReviews = 0;
        e.weeklyAB = Math.round(e.weeklyAB * 6) / 10;
        e.weeklyBA = Math.round(e.weeklyBA * 6) / 10;
        const closed = (e.weeklyAB + e.weeklyBA) / 2 < 1.5;
        if (closed) e.closed = true;
        if (players.length || notable(airline)) {
          message(ctx, 'aiExit', players.length > 0, { airline: airline.name, from, to, value: closed ? 0 : Math.round((e.weeklyAB + e.weeklyBA) / 2) });
        }
      }
    } else if (change && change.badReviews > 0) {
      change.badReviews--;
    }
  }

  // The airline's health: how much its network lost or gained against the real starting point.
  status.health = 0.6 * status.health + 0.4 * (delta / (networkRevenue(world, airline) * 1.0));

  // d) Growth: open a new route from a hub or base.
  if (random(state) < b.growChance) openNewRoute(ctx, airline);

  // e) Bankruptcy: a network that became clearly worse than at the start (small airlines only), or — rarely — a
  //    small airline whose changed routes keep losing a lot.
  const small = Math.max(fleetSize(airline), airline.registered.length) < 120;
  const weak = affectedRevenue > 0.1 * networkRevenue(world, airline) && affectedProfit / affectedRevenue < -0.25;
  const odds = small && status.health < -0.1 ? 0.08 : small && weak && airline.model !== 'legacy' ? 0.004 : 0;
  if (odds > 0 && random(state) < odds) {
    status.status = 'bankrupt';
    status.since = state.time;
    message(ctx, 'aiBankrupt', currentRoutesShared(ctx, airline), { airline: airline.name, routes: ctx.world.realAirlines!.routesOf(airline.id).length });
  }
}

function currentRoutesShared(ctx: Ctx, airline: RealAirline): boolean {
  return Object.values(ctx.state.routes).some((r) =>
    ctx.world.realAirlines!.on(r.originId, r.destinationId).some((c) => c.airline.id === airline.id),
  );
}

/** Opens a route from a hub/base to a busy airport the airline doesn't serve yet (others fly there from that base). */
function openNewRoute(ctx: Ctx, airline: RealAirline): void {
  const { world, state } = ctx;
  const real = world.realAirlines!;
  const bases = [...airline.hubs, ...airline.bases];
  if (!bases.length) return;
  const base = bases[Math.floor(random(state) * bases.length)]!;
  const served = new Set([
    ...real.routesOf(airline.id).flatMap((r) => [r.a, r.b]),
    ...ctx.addedBy(airline.id).flat(),
  ]);
  const candidates = [...new Set(real.routesAt(base).map((r) => (r.a === base ? r.b : r.a)))].filter((ap) => !served.has(ap)).slice(0, 25);
  const A = world.airportById.get(base);
  if (!A) return;
  let best: { ap: Airport; pax: number; others: number } | null = null;
  for (const id of candidates) {
    const B = world.airportById.get(id);
    if (!B) continue;
    const m = market(world, A, B);
    if (!aircraftFor(airline, m.distanceKm, yearOf(state.time))) continue;
    const others = competitorsOn(world, A, B, m, state.ai)?.length ?? 0;
    const score = m.weeklyPax / (others + 1);
    if (!best || score > best.pax / (best.others + 1)) best = { ap: B, pax: m.weeklyPax, others };
  }
  if (!best || best.pax < 300) return;
  const weekly = Math.max(2, Math.min(14, Math.round((best.pax / (best.others + 1) / 150) * 2) / 2));
  const key = aiRouteKey(airline.id, base, best.ap.id);
  state.ai.routes[key] = { weeklyAB: weekly, weeklyBA: weekly, fare: MODEL_FARE[airline.model], added: true, badReviews: 0, since: state.time };
  const pair = base < best.ap.id ? `${base}|${best.ap.id}` : `${best.ap.id}|${base}`;
  state.ai.added[pair] = [...new Set([...(state.ai.added[pair] ?? []), airline.id])];
  const touchesPlayer = !!ctx.playerId && ctx.playerHubs.has(base);
  if (notable(airline) || touchesPlayer) {
    message(ctx, 'aiNewRoute', false, { airline: airline.name, from: code(ctx, base), to: code(ctx, best.ap.id), value: weekly });
  }
}

/** 1st of the month: airlines with a base at either end may enter the player's profitable routes. */
function watchPlayerRoutes(ctx: Ctx): void {
  const { world, state } = ctx;
  const real = world.realAirlines!;
  if (!ctx.playerId) return;
  const lastWeek = state.finance[ctx.playerId]?.history.at(-1);
  for (const route of Object.values(state.routes)) {
    const stats = lastWeek?.routes[route.id];
    if (!stats || stats.seats === 0 || stats.pax / stats.seats < 0.8 || stats.revenue <= stats.directCosts) continue;
    const A = world.airportById.get(route.originId);
    const B = world.airportById.get(route.destinationId);
    if (!A || !B) continue;
    const present = new Set((competitorsOn(world, A, B, undefined, state.ai) ?? []).map((c) => c.airlineId));
    const candidates = [...real.byId.values()]
      .filter((a) => !present.has(a.id) && state.ai.airlines[a.id]?.status !== 'bankrupt')
      .filter((a) => [...a.hubs, ...a.bases].some((h) => h === A.id || h === B.id))
      .filter((a) => aircraftFor(a, market(world, A, B).distanceKm, yearOf(state.time)))
      .sort((x, y) => behaviourOf(y, ctx.playerHubs).entryChance - behaviourOf(x, ctx.playerHubs).entryChance || x.id.localeCompare(y.id));
    const entrant = candidates[0];
    if (!entrant || random(state) >= behaviourOf(entrant, ctx.playerHubs).entryChance) continue;
    const weekly = Math.max(3, Math.round(route.frequency * 0.7));
    const key = aiRouteKey(entrant.id, A.id, B.id);
    state.ai.routes[key] = { weeklyAB: weekly, weeklyBA: weekly, fare: MODEL_FARE[entrant.model], added: true, badReviews: 0, since: state.time };
    const pair = A.id < B.id ? `${A.id}|${B.id}` : `${B.id}|${A.id}`;
    state.ai.added[pair] = [...new Set([...(state.ai.added[pair] ?? []), entrant.id])];
    message(ctx, 'aiEnter', true, { airline: entrant.name, from: code(ctx, A.id), to: code(ctx, B.id), value: weekly });
    networkChanged(state.ai, entrant.id);
  }
}

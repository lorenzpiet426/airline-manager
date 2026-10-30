// Transfer passengers (Phase 6.1): travellers who change planes at an airline's hub, e.g. Kyiv → Vienna → New York on
// Austrian. Network airlines fill a large part of their seats with them (Austrian about half). For every pair of the
// airline's destinations at a hub, a share of the travellers between them connect there, if the detour is small enough.
// Fewer of them do when a non-stop flight exists. Each transfer passenger pays a share of the through fare in proportion
// to the distance flown on each leg ("prorate"). AI airlines: fewer connect when the airline's flights are rare. The
// player (Phase 7.1): flight by flight — only where an arrival and a departure at the hub are at least the minimum
// connecting time apart and not too long, and the passengers sit on exactly those flights.
import { CODESHARE_FEED } from '../data/allianceRules';
import type { Airport } from '../data/types';
import { gravityAnnualPax, marketFareUsd } from './economics';
import { distanceKm } from './geo';
import type { RealAirline } from './realAirlines';
import type { AiState, FlightPair, GameState, Route } from './state';
import { getAircraftType } from '../data/aircraft';
import { pairTimes, pairsOfRoute } from './schedule';
import { hasDay, LONG_HAUL_MIN } from './timetable';
import { gatesOf, hubGatesCached, REMOTE_MCT_EXTRA } from './hub';
import type { EngineWorld } from './world';

/** Share of the travellers between two places that fly with a change of planes when no non-stop flight exists
 * (shared between all hubs that connect them). */
const SHARE_NO_NONSTOP = 0.5;
/** The same when somebody flies non-stop (connections are for the price-conscious and for missing times). */
const SHARE_WITH_NONSTOP = 0.08;
/** Calibration: the gravity model counts all travellers between two places, also those who never fly (fitted so that
 * Austrian at Vienna and Lufthansa at Frankfurt carry about as many transfer passengers as they report). */
const TRANSFER_K = 0.07;
/** Detours up to this ratio (via the hub vs direct) cost nothing; beyond it fewer travellers connect, none from DETOUR_MAX. */
const DETOUR_FREE = 1.15;
const DETOUR_MAX = 1.8;
/** Journeys longer than this are boosted (see longJourney): the gravity model's distance decay is for local markets. */
const LONG_JOURNEY_FROM_KM = 2000;
const LONG_JOURNEY_EXP = 1.1;
const LONG_JOURNEY_MAX = 6;
/** Flights per week from which a leg offers full connectivity (daily); rarer legs connect fewer travellers. */
const FULL_CONNECTIVITY_WEEKLY = 7;
/** Weekly flights assumed on a real leg without official frequencies (the demand model isn't asked here). */
const UNKNOWN_WEEKLY = 7;
/** Travellers between airports closer than this go by train or car rather than flying via a hub. */
const MIN_OD_KM = 300;
/** Business models that sell connections at their hubs. Low-cost and charter airlines fly point to point. */
const CONNECTING_MODELS = new Set<RealAirline['model']>(['legacy']);

/** Transfer passengers on the leg hub ⇄ destination: per week in each direction, and what they pay relative to the leg's market fare. */
export interface LegTransfers {
  pax: number;
  yield: number;
  /** Player's flights (Phase 7.1): weekly transfer passengers per flight ("pairId:dir") and weekday of its departure. */
  perFlight?: Map<string, number[]>;
}

/** Weekly flights (average of both directions) from a hub to each destination. */
export type HubLegs = ReadonlyMap<string, number>;

const tables = new WeakMap<EngineWorld, Map<string, Map<string, LegTransfers>>>();
const fareRef = new Date(Date.UTC(2025, 6, 1));

const connectivity = (weekly: number) => Math.min(1, weekly / FULL_CONNECTIVITY_WEEKLY) ** 0.5;

/** Every hub where a real network airline connects passengers, by the airports it flies to (real networks). */
const hubIndexes = new WeakMap<EngineWorld, Map<string, string[]>>();
function hubsServing(world: EngineWorld): Map<string, string[]> {
  let index = hubIndexes.get(world);
  if (index) return index;
  index = new Map();
  const real = world.realAirlines;
  if (real) {
    for (const airline of real.byId.values()) {
      for (const hub of airline.hubs) {
        if (!connectsAt(airline, hub)) continue;
        const tag = `${airline.id}@${hub}`;
        for (const r of real.routesOf(airline.id)) {
          if (r.a !== hub && r.b !== hub) continue;
          const other = r.a === hub ? r.b : r.a;
          const list = index.get(other) ?? [];
          if (!list.includes(tag)) list.push(tag);
          index.set(other, list);
        }
      }
    }
  }
  hubIndexes.set(world, index);
  return index;
}

const longJourney = (km: number) => Math.min(LONG_JOURNEY_MAX, Math.max(1, km / LONG_JOURNEY_FROM_KM) ** LONG_JOURNEY_EXP);

const detourFactorOf = (viaKm: number, direct: number) => {
  const detour = viaKm / direct;
  return detour >= DETOUR_MAX ? 0 : detour <= DETOUR_FREE ? 1 : 1 - (detour - DETOUR_FREE) / (DETOUR_MAX - DETOUR_FREE);
};

function nonstopExists(world: EngineWorld, a: string, b: string): boolean {
  const real = world.realAirlines;
  return !!real && (real.on(a, b).length > 0 || real.on(b, a).length > 0);
}

interface PairData {
  /** Travellers per week in each direction who would connect at this hub if it were the only one. */
  flow: number;
  detour: number;
  /** The other hubs' appeal for these travellers (detour factors added up). */
  others: number;
  /** Through fare E → D (USD, reference fuel price). */
  through: number;
}

/** What doesn't depend on the airline's frequencies, per hub and pair of destinations (cached: AI changes are frequent). */
const pairCaches = new WeakMap<EngineWorld, Map<string, PairData | null>>();
function pairData(world: EngineWorld, selfTag: string, E: Airport, D: Airport, dE: number, dD: number, otherHubs: Map<string, Map<string, number>>): PairData | null {
  let cache = pairCaches.get(world);
  if (!cache) pairCaches.set(world, (cache = new Map()));
  const key = `${selfTag}|${E.id}|${D.id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let data: PairData | null = null;
  const direct = distanceKm(E, D);
  const detour = direct < MIN_OD_KM ? 0 : detourFactorOf(dE + dD, direct);
  if (detour > 0) {
    // The other hubs that connect E and D compete for these travellers (by their detour).
    let others = 0;
    const atD = otherHubs.get(D.id)!;
    for (const [tag, eg] of otherHubs.get(E.id)!) {
      const gd = atD.get(tag);
      if (gd !== undefined) others += detourFactorOf(eg + gd, direct);
    }
    // Long journeys are made via hubs much more often than the gravity model (fitted to short routes) suggests.
    const share = nonstopExists(world, E.id, D.id) ? SHARE_WITH_NONSTOP : SHARE_NO_NONSTOP;
    const flow = (gravityAnnualPax(world, E, D, direct) / 104) * share * TRANSFER_K * longJourney(direct);
    if (flow > 0) data = { flow, detour, others, through: marketFareUsd(world, E, D, fareRef, 2.2) };
  }
  if (cache.size > 2_000_000) cache.clear();
  cache.set(key, data);
  return data;
}

/** Transfer passengers on every leg of a hub's network (cached per hub and network). */
export function transferTable(world: EngineWorld, hubId: string, legs: HubLegs, self = '', feed: HubLegs = new Map()): Map<string, LegTransfers> {
  // Only what changes the result goes into the key: legs flown daily or more all connect fully.
  const legKey = (m: HubLegs) => [...m].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([d, w]) => (w >= FULL_CONNECTIVITY_WEEKLY ? d : `${d}:${Math.round(w * 2)}`)).join(',');
  const key = `${self}@${hubId}|${legKey(feed)}|${[...legs].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([d, w]) => (w >= FULL_CONNECTIVITY_WEEKLY ? d : `${d}:${Math.round(w * 2)}`)).join(',')}`;
  let cache = tables.get(world);
  if (!cache) tables.set(world, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;

  const H = world.airportById.get(hubId);
  const ends = [...legs.keys()].map((id) => world.airportById.get(id)).filter((a): a is Airport => !!a && a.id !== hubId);
  // Partners' spokes (Phase 6.2): their passengers can connect onto this airline's flights (only its legs earn).
  const feeders = [...feed.keys()].filter((id) => !legs.has(id)).map((id) => world.airportById.get(id)).filter((a): a is Airport => !!a && a.id !== hubId);
  const pax = new Map<string, number>();
  const revenue = new Map<string, number>(); // in units of the leg's market fare
  const index = hubsServing(world);
  const selfTag = `${self}@${hubId}`;
  if (H) {
    const toHub = new Map([...ends, ...feeders].map((e) => [e.id, Math.max(50, distanceKm(e, H))]));
    // The other connecting hubs at each destination, with their distance from it.
    const otherHubs = new Map(
      [...ends, ...feeders].map((e) => [
        e.id,
        new Map(
          (index.get(e.id) ?? []).flatMap((tag) => {
            const G = tag === selfTag ? undefined : world.airportById.get(tag.slice(tag.indexOf('@') + 1));
            return G ? [[tag, distanceKm(e, G)] as const] : [];
          }),
        ),
      ]),
    );
    const legFare = new Map(ends.map((e) => [e.id, marketFareUsd(world, H, e, fareRef, 2.2)]));
    for (let i = 0; i < ends.length; i++) {
      const E = ends[i]!;
      const dE = toHub.get(E.id)!;
      for (let j = i + 1; j < ends.length; j++) {
        const D = ends[j]!;
        const dD = toHub.get(D.id)!;
        const pair = pairData(world, selfTag, E, D, dE, dD, otherHubs);
        if (!pair) continue;
        const mine = pair.detour * connectivity(Math.min(legs.get(E.id)!, legs.get(D.id)!));
        // Travellers per week in each direction between E and D who connect here, sharing them with the other hubs.
        const flow = (pair.flow * mine) / (mine + pair.others);
        for (const [leg, d] of [[E.id, dE], [D.id, dD]] as const) {
          pax.set(leg, (pax.get(leg) ?? 0) + flow);
          revenue.set(leg, (revenue.get(leg) ?? 0) + (flow * pair.through * (d / (dE + dD))) / legFare.get(leg)!);
        }
      }
      for (const F of feeders) {
        const dF = toHub.get(F.id)!;
        const pair = pairData(world, selfTag, F, E, dF, dE, otherHubs);
        if (!pair) continue;
        const mine = pair.detour * connectivity(Math.min(feed.get(F.id)!, legs.get(E.id)!));
        const flow = (pair.flow * mine) / (mine + pair.others);
        pax.set(E.id, (pax.get(E.id) ?? 0) + flow);
        revenue.set(E.id, (revenue.get(E.id) ?? 0) + (flow * pair.through * (dE / (dE + dF))) / legFare.get(E.id)!);
      }
    }
  }
  const table = new Map<string, LegTransfers>();
  for (const [leg, p] of pax) table.set(leg, { pax: p, yield: p > 0 ? revenue.get(leg)! / p : 0 });
  if (cache.size > 4000) cache.clear();
  cache.set(key, table);
  return table;
}

/** Does this real airline sell connections at this airport? */
export const connectsAt = (airline: RealAirline, airportId: string) => CONNECTING_MODELS.has(airline.model) && airline.hubs.includes(airportId);

/** A real airline's legs at one of its hubs as they are in this game (closed routes left out, AI changes included). */
export function realHubLegs(world: EngineWorld, airline: RealAirline, hubId: string, ai?: AiState): Map<string, number> {
  const legs = new Map<string, number>();
  if (ai?.airlines[airline.id] && ai.airlines[airline.id]!.status !== 'active') return legs;
  const key = (x: string, y: string) => (x < y ? `${airline.id}|${x}|${y}` : `${airline.id}|${y}|${x}`);
  for (const r of world.realAirlines?.routesOf(airline.id) ?? []) {
    if (r.a !== hubId && r.b !== hubId) continue;
    const other = r.a === hubId ? r.b : r.a;
    const change = ai?.routes[key(r.a, r.b)];
    if (change?.closed) continue;
    const weekly = change ? (change.weeklyAB + change.weeklyBA) / 2 : r.weeklyAB !== null || r.weeklyBA !== null ? ((r.weeklyAB ?? r.weeklyBA)! + (r.weeklyBA ?? r.weeklyAB)!) / 2 : UNKNOWN_WEEKLY * (r.seasonal ? 0.5 : 1);
    if (weekly > 0) legs.set(other, weekly);
  }
  for (const [k, change] of Object.entries(ai?.routes ?? {})) {
    if (!change.added || change.closed || !k.startsWith(`${airline.id}|`)) continue;
    const [, a, b] = k.split('|') as [string, string, string];
    if (a !== hubId && b !== hubId) continue;
    legs.set(a === hubId ? b : a, (change.weeklyAB + change.weeklyBA) / 2);
  }
  return legs;
}

const revisions = new WeakMap<AiState, Map<string, number>>();
/** The AI changed an airline's network (routes, frequencies, bankruptcy): its hub tables must be worked out again. */
export function networkChanged(ai: AiState, airlineId: string): void {
  let revs = revisions.get(ai);
  if (!revs) revisions.set(ai, (revs = new Map()));
  revs.set(airlineId, (revs.get(airlineId) ?? 0) + 1);
}

const NO_AI = {} as AiState;
const tablesNow = new WeakMap<EngineWorld, WeakMap<AiState, Map<string, Map<string, LegTransfers>>>>();

/** Transfer passengers of a real airline on its route a–b (the end that is its hub), as the game is now. */
export function realLegTransfers(world: EngineWorld, airline: RealAirline, a: string, b: string, ai?: AiState): LegTransfers | null {
  const hub = connectsAt(airline, a) ? a : connectsAt(airline, b) ? b : null;
  if (!hub) return null;
  let byAi = tablesNow.get(world);
  if (!byAi) tablesNow.set(world, (byAi = new WeakMap()));
  let memo = byAi.get(ai ?? NO_AI);
  if (!memo) byAi.set(ai ?? NO_AI, (memo = new Map()));
  const key = `${airline.id}@${hub}#${(ai && revisions.get(ai)?.get(airline.id)) ?? 0}`;
  let table = memo.get(key);
  if (!table) {
    table = transferTable(world, hub, realHubLegs(world, airline, hub, ai), airline.id);
    memo.set(key, table);
  }
  return table.get(hub === a ? b : a) ?? null;
}

const realTotals = new WeakMap<EngineWorld, Map<string, number>>();

/**
 * Transfer passengers per week a→b carried by the real airlines with the real networks (no changes in a game): the part
 * of the measured passengers on the route that are not local travellers.
 */
export function realTransfersOn(world: EngineWorld, a: string, b: string): number {
  let cache = realTotals.get(world);
  if (!cache) realTotals.set(world, (cache = new Map()));
  const key = `${a}>${b}`;
  let total = cache.get(key);
  if (total === undefined) {
    total = 0;
    for (const { airline } of world.realAirlines?.on(a, b) ?? []) total += realLegTransfers(world, airline, a, b)?.pax ?? 0;
    cache.set(key, total);
  }
  return total;
}

/** The player's legs at their hub: every route's destination with its weekly round trips. */
export function playerHubLegs(state: GameState, airlineId: string): Map<string, number> {
  const legs = new Map<string, number>();
  for (const r of Object.values(state.routes)) if (r.airlineId === airlineId) legs.set(r.destinationId, (legs.get(r.destinationId) ?? 0) + r.frequency);
  return legs;
}

/** The player's group partners' spokes at a hub (weekly flights per airport), whose passengers connect onto the player. */
export function partnerFeed(world: EngineWorld, state: GameState, airlineId: string, hubId: string): Map<string, number> {
  const feed = new Map<string, number>();
  const airline = state.airlines[airlineId];
  const codeshare = new Set((airline?.codeshares ?? []).map((c) => c.partnerId));
  for (const id of airline?.partners ?? []) {
    const partner = world.realAirlines?.byId.get(id);
    if (!partner) continue;
    // A codeshare shows the connection as one airline's in booking systems: more passengers take it (Phase 11.1).
    const weight = codeshare.has(id) ? CODESHARE_FEED : 1;
    for (const [dest, weekly] of realHubLegs(world, partner, hubId, state.ai)) feed.set(dest, (feed.get(dest) ?? 0) + weekly * weight);
  }
  return feed;
}

const feedCache = new WeakMap<GameState, { key: string; feed: Map<string, number> }>();
/** The partners' feed changes at most once a day (their monthly reviews): worked out once per day and hub. */
function dailyFeed(world: EngineWorld, state: GameState, airlineId: string, hubId: string): Map<string, number> {
  const a = state.airlines[airlineId];
  const key = `${airlineId}@${hubId}#${Math.floor(state.time / 1440)}|${a?.partners?.join(',')}|${a?.codeshares?.length ?? 0}`;
  const hit = feedCache.get(state);
  if (hit?.key === key) return hit.feed;
  const feed = partnerFeed(world, state, airlineId, hubId);
  feedCache.set(state, { key, feed });
  return feed;
}

// ─── The player's hub, flight by flight (Phase 7.1) ────────────────────────────────

/**
 * Minimum connecting times (minutes) as the airports or their home airlines publish them (read 2026-10-29: Aviation
 * Week / Austrian Airlines for Vienna, Business Traveller and airline pages for the others). Other airports: a large
 * one 60 min, a medium one 45 min. Connections with a long-haul flight need LONG_HAUL_EXTRA_MIN more (other terminal
 * or pier, passport control).
 */
export const MCT_MIN: Readonly<Record<string, number>> = {
  LOWW: 25, // Vienna (the shortest of Europe's big hubs)
  EDDM: 30, // Munich
  LSZH: 40, // Zurich
  EHAM: 40, // Amsterdam (short-haul)
  EDDF: 45, // Frankfurt (Lufthansa: 60 from 2025)
  EGLL: 60, // London Heathrow (British Airways T5: 60–75)
  LFPG: 60, // Paris Charles de Gaulle
};
const LONG_HAUL_EXTRA_MIN = 10;
/** Waits up to this suit everybody; longer ones lose travellers (other routings are faster). */
const GOOD_WAIT_MIN = 150;
/** No one waits longer than this for a connection (journeys of several thousand km: LONG_WAIT_MIN). */
const MAX_WAIT_MIN = 420;
const LONG_WAIT_MIN = 720;
const LONG_JOURNEY_KM = 4000;
const WEEK = 7 * 1440;

export const mctAt = (hub: Airport, longHaul: boolean): number =>
  (MCT_MIN[hub.id] ?? (hub.size === 'large' ? 60 : 45)) + (longHaul ? LONG_HAUL_EXTRA_MIN : 0);

/** How good a connection with this wait is for the travellers (0 = impossible or useless, 1 = good). */
export function connectionQuality(wait: number, mct: number, journeyKm: number): number {
  if (wait < mct) return 0;
  if (wait <= Math.max(GOOD_WAIT_MIN, mct)) return 1;
  const max = journeyKm >= LONG_JOURNEY_KM ? LONG_WAIT_MIN : MAX_WAIT_MIN;
  return Math.max(0, 1 - (wait - GOOD_WAIT_MIN) / (max - GOOD_WAIT_MIN));
}

/** A flight of the player at the hub: its key ("pairId:dir"), the time at the hub (minute of the week, hub local) and
 * the weekday of its departure (the departure from the destination for flights into the hub). */
export interface HubFlight {
  key: string;
  routeId: string;
  dest: string;
  at: number;
  day: number;
  longHaul: boolean;
}

/** The player's departures from and arrivals at the hub, per destination. */
export function hubFlights(world: EngineWorld, state: GameState, airlineId: string, hubId: string): { out: Map<string, HubFlight[]>; in: Map<string, HubFlight[]> } {
  const out = new Map<string, HubFlight[]>();
  const inbound = new Map<string, HubFlight[]>();
  for (const route of Object.values(state.routes)) {
    if (route.airlineId !== airlineId || route.originId !== hubId || !world.airportById.has(route.destinationId)) continue;
    for (const pair of pairsOfRoute(state, route.id) as FlightPair[]) {
      const aircraft = state.aircraft[pair.aircraftId];
      if (!aircraft) continue;
      const t = pairTimes(world, aircraft.typeId, route, pair, state.time);
      const longHaul = t.outArr - t.outDep > LONG_HAUL_MIN || getAircraftType(aircraft.typeId).category === 'widebody';
      for (let d = 0; d < 7; d++) {
        if (!hasDay(pair.days, d)) continue;
        const dep = d * 1440 + pair.dep;
        (out.get(route.destinationId) ?? out.set(route.destinationId, []).get(route.destinationId)!).push({ key: `${pair.id}:0`, routeId: route.id, dest: route.destinationId, at: dep % WEEK, day: d, longHaul });
        const backDay = (((d + Math.floor(t.backDep / 1440)) % 7) + 7) % 7;
        (inbound.get(route.destinationId) ?? inbound.set(route.destinationId, []).get(route.destinationId)!).push({ key: `${pair.id}:1`, routeId: route.id, dest: route.destinationId, at: (d * 1440 + t.backArr) % WEEK, day: backDay, longHaul });
      }
    }
  }
  return { out, in: inbound };
}

/** One connection the player offers (for the screens): passengers per week from an arrival onto a departure. */
export interface Connection {
  from: string;
  to: string;
  arrival: string;
  departure: string;
  wait: number;
  pax: number;
}

export interface PlayerConnections {
  /** Per route: [outbound (hub → destination), inbound (destination → hub)]. */
  legs: Map<string, [LegTransfers, LegTransfers]>;
  connections: Connection[];
  /** Journeys E → D via the hub that have travellers but no workable connection: passengers per week possible. */
  missed: { from: string; to: string; pax: number }[];
}

const playerCache = new WeakMap<GameState, { key: string; result: PlayerConnections }>();

/**
 * Transfer passengers at the player's hub, flight by flight: for every pair of destinations E → D, the travellers who
 * would connect here (as in transferTable) — but only as far as the player's arrivals from E meet departures to D within
 * a good connecting time, and they sit on exactly those flights. Partners' passengers (no timetable known) are spread
 * over the player's flights as before. Cached until the timetable changes (and once per day for the partners).
 */
export function playerConnections(world: EngineWorld, state: GameState, airlineId: string, hubId: string): PlayerConnections {
  const signature = Object.values(state.flights)
    .filter((p) => p.airlineId === airlineId)
    .map((p) => `${p.id}${p.dep}${p.days}${p.groundMin}${p.aircraftId}`)
    .join('');
  const g = gatesOf(state.airlines[airlineId], hubId);
  const key = `${airlineId}@${hubId}#${Math.floor(state.time / 1440)}#${signature.length}#${hashOf(signature)}#${g?.contact ?? '-'}/${g?.remote ?? '-'}`;
  const hit = playerCache.get(state);
  if (hit?.key === key) return hit.result;

  const airline = state.airlines[airlineId];
  const self = airline?.realId ?? airlineId;
  const feed = airline?.partners?.length ? dailyFeed(world, state, airlineId, hubId) : new Map<string, number>();
  const H = world.airportById.get(hubId);
  const flights = hubFlights(world, state, airlineId, hubId);
  const gateOf = gatesOf(state.airlines[airlineId], hubId) ? hubGatesCached(state, world, airlineId, hubId).gateOf : null;
  const dests = [...new Set([...flights.out.keys(), ...flights.in.keys()])].map((id) => world.airportById.get(id)).filter((a): a is Airport => !!a);
  const feeders = [...feed.keys()].filter((id) => !flights.out.has(id)).map((id) => world.airportById.get(id)).filter((a): a is Airport => !!a && a.id !== hubId);
  const per = new Map<string, number[]>();
  const add = (k: string, day: number, n: number) => {
    const list = per.get(k) ?? per.set(k, [0, 0, 0, 0, 0, 0, 0]).get(k)!;
    list[day]! += n;
  };
  const legPax = new Map<string, [number, number]>();
  const legRev = new Map<string, [number, number]>();
  const addLeg = (dest: string, dir: 0 | 1, pax: number, rev: number) => {
    const p = legPax.get(dest) ?? legPax.set(dest, [0, 0]).get(dest)!;
    const r = legRev.get(dest) ?? legRev.set(dest, [0, 0]).get(dest)!;
    p[dir] += pax;
    r[dir] += rev;
  };
  const connections: Connection[] = [];
  const missed: PlayerConnections['missed'] = [];
  if (H) {
    const index = hubsServing(world);
    const selfTag = `${self}@${hubId}`;
    const all = [...dests, ...feeders];
    const toHub = new Map(all.map((e) => [e.id, Math.max(50, distanceKm(e, H))]));
    const otherHubs = new Map(
      all.map((e) => [
        e.id,
        new Map(
          (index.get(e.id) ?? []).flatMap((tag) => {
            const G = tag === selfTag ? undefined : world.airportById.get(tag.slice(tag.indexOf('@') + 1));
            return G ? [[tag, distanceKm(e, G)] as const] : [];
          }),
        ),
      ]),
    );
    const legFare = new Map(dests.map((e) => [e.id, marketFareUsd(world, H, e, fareRef, 2.2)]));
    for (const E of dests) {
      const arrivals = flights.in.get(E.id) ?? [];
      for (const D of dests) {
        if (D.id === E.id) continue;
        const departures = flights.out.get(D.id) ?? [];
        if (!arrivals.length || !departures.length) continue;
        const pair = pairData(world, selfTag, E, D, toHub.get(E.id)!, toHub.get(D.id)!, otherHubs);
        if (!pair) continue;
        const km = distanceKm(E, D);
        // Each arrival from E with its best departure to D.
        let total = 0;
        const best: [HubFlight, HubFlight, number, number][] = [];
        for (const a of arrivals) {
          let top: [HubFlight, number, number] | null = null;
          for (const d of departures) {
            const wait = (((d.at - a.at) % WEEK) + WEEK) % WEEK;
            // A remote stand (bus) at either end of the change takes longer (Phase 7.3).
            const bus = gateOf && (gateOf.get(a.key) === 'remote' || gateOf.get(d.key) === 'remote') ? REMOTE_MCT_EXTRA : 0;
            const q = connectionQuality(wait, mctAt(H, a.longHaul || d.longHaul) + bus, km);
            if (q > 0 && (!top || q > top[1] || (q === top[1] && wait < top[2]))) top = [d, q, wait];
          }
          if (top) {
            best.push([a, top[0], top[1], top[2]]);
            total += top[1];
          }
        }
        if (total <= 0) {
          missed.push({ from: E.id, to: D.id, pax: (pair.flow * pair.detour) / (pair.detour + pair.others) });
          continue;
        }
        // Good connections on every day of the week connect fully (as daily flights did before).
        const mine = pair.detour * Math.min(1, total / FULL_CONNECTIVITY_WEEKLY) ** 0.5;
        const flow = (pair.flow * mine) / (mine + pair.others);
        const dE = toHub.get(E.id)!;
        const dD = toHub.get(D.id)!;
        for (const [a, d, q, wait] of best) {
          const n = (flow * q) / total;
          add(a.key, a.day, n);
          add(d.key, d.day, n);
          addLeg(E.id, 1, n, (n * pair.through * (dE / (dE + dD))) / legFare.get(E.id)!);
          addLeg(D.id, 0, n, (n * pair.through * (dD / (dE + dD))) / legFare.get(D.id)!);
          connections.push({ from: E.id, to: D.id, arrival: a.key, departure: d.key, wait, pax: n });
        }
      }
      // Partners' passengers onto (and off) the player's flights to E: spread over them.
      for (const F of feeders) {
        const dF = toHub.get(F.id)!;
        const dE = toHub.get(E.id)!;
        const pair = pairData(world, selfTag, F, E, dF, dE, otherHubs);
        if (!pair) continue;
        const weeklyE = (flights.out.get(E.id)?.length ?? 0);
        const mine = pair.detour * connectivity(Math.min(feed.get(F.id)!, weeklyE));
        const flow = (pair.flow * mine) / (mine + pair.others);
        const rev = (flow * pair.through * (dE / (dE + dF))) / legFare.get(E.id)!;
        for (const [dir, list] of [[0, flights.out.get(E.id) ?? []], [1, arrivals]] as const) {
          if (!list.length) continue;
          for (const f of list) add(f.key, f.day, flow / list.length);
          addLeg(E.id, dir, flow, rev);
        }
      }
    }
  }
  const legs = new Map<string, [LegTransfers, LegTransfers]>();
  for (const route of Object.values(state.routes)) {
    if (route.airlineId !== airlineId || route.originId !== hubId) continue;
    const p = legPax.get(route.destinationId) ?? [0, 0];
    const r = legRev.get(route.destinationId) ?? [0, 0];
    const leg = (dir: 0 | 1): LegTransfers => ({
      pax: p[dir],
      yield: p[dir] > 0 ? r[dir] / p[dir] : 0,
      perFlight: new Map([...per].filter(([k]) => state.flights[k.slice(0, k.lastIndexOf(':'))]?.routeId === route.id && k.endsWith(`:${dir}`))),
    });
    legs.set(route.id, [leg(0), leg(1)]);
  }
  const result = { legs, connections, missed: missed.sort((x, y) => y.pax - x.pax) };
  playerCache.set(state, { key, result });
  return result;
}

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Transfer passengers on one of the player's routes, per direction ([hub → destination, destination → hub]): flight by
 * flight between their own flights at the hub (Phase 7.1), plus those from group partners' flights (Phase 6.2). A
 * taken-over airline doesn't compete with its own real hub.
 */
export function routeTransfers(world: EngineWorld, state: GameState, route: Route): [LegTransfers | null, LegTransfers | null] {
  const legs = playerConnections(world, state, route.airlineId, route.originId).legs.get(route.id);
  return legs ? [legs[0], legs[1]] : [null, null];
}

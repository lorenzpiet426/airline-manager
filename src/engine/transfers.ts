// Transfer passengers (Phase 6.1): travellers who change planes at an airline's hub, e.g. Kyiv → Vienna → New York on
// Austrian. Network airlines fill a large part of their seats with them (Austrian about half). A simple model until the
// full hub phase (Phase 7, with connection times and waves): for every pair of the airline's destinations at a hub, a
// share of the travellers between them connect there, if the detour is small enough. Fewer of them do when a non-stop
// flight exists, and fewer when the airline's flights are rare. Each transfer passenger pays a share of the through
// fare in proportion to the distance flown on each leg ("prorate").
import type { Airport } from '../data/types';
import { gravityAnnualPax, marketFareUsd } from './economics';
import { distanceKm } from './geo';
import type { RealAirline } from './realAirlines';
import type { AiState, GameState, Route } from './state';
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
export function transferTable(world: EngineWorld, hubId: string, legs: HubLegs, self = ''): Map<string, LegTransfers> {
  // Only what changes the result goes into the key: legs flown daily or more all connect fully.
  const key = `${self}@${hubId}|${[...legs].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([d, w]) => (w >= FULL_CONNECTIVITY_WEEKLY ? d : `${d}:${Math.round(w * 2)}`)).join(',')}`;
  let cache = tables.get(world);
  if (!cache) tables.set(world, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;

  const H = world.airportById.get(hubId);
  const ends = [...legs.keys()].map((id) => world.airportById.get(id)).filter((a): a is Airport => !!a && a.id !== hubId);
  const pax = new Map<string, number>();
  const revenue = new Map<string, number>(); // in units of the leg's market fare
  const index = hubsServing(world);
  const selfTag = `${self}@${hubId}`;
  if (H) {
    const toHub = new Map(ends.map((e) => [e.id, Math.max(50, distanceKm(e, H))]));
    // The other connecting hubs at each destination, with their distance from it.
    const otherHubs = new Map(
      ends.map((e) => [
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
  if (ai?.airlines[airline.id]?.status === 'bankrupt') return legs;
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

/** Transfer passengers between the player's own flights at their hub, on one of their routes (each direction). */
export function routeTransfers(world: EngineWorld, state: GameState, route: Route): LegTransfers | null {
  return transferTable(world, route.originId, playerHubLegs(state, route.airlineId), route.airlineId).get(route.destinationId) ?? null;
}

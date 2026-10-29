// Fictional startup airlines (Phase 6.4): in games with real airlines, new airlines are founded over time, as they
// were in reality — mostly where markets are free (the USA after 1978, Europe after the 1990s, the rest of the world
// from 1995), with made-up names and colours. They start small at one base with a few routes, grow while their routes
// earn money and often fail within a few years. Everything else is the normal AI: their routes are "added" routes that
// are reviewed every month (losing ones are given up), they can enter the player's routes and open new ones.
import { faresFreeFrom } from '../data/eras';
import { generatedColors } from '../data/airlineColors';
import type { Airport } from '../data/types';
import { aircraftFor } from './ai';
import { postMessage } from './core';
import { aiRouteKey, competitorsOn, market, MODEL_FARE } from './economics';
import { LOW_COST_FROM } from './era';
import type { BusinessModel, RealAirline, RealAirlines } from './realAirlines';
import { random } from './rng';
import type { GameState } from './state';
import { MINUTES_PER_DAY, toDate, yearOf, type SimTime } from './time';
import type { EngineWorld } from './world';

/** A fictional airline founded during the game. */
export interface StartupAirline {
  id: string;
  name: string;
  iata: string;
  icao: string;
  country: string;
  model: BusinessModel;
  base: string;
  founded: SimTime;
}

/**
 * New airlines a year in free markets worldwide that grow big enough to matter on the game's routes (real counts are
 * higher, but most are tiny air-taxi or regional firms the game doesn't model).
 */
export const STARTUPS_PER_YEAR = 8;
/** Monthly chance that a young startup (first three years) fails anyway (≈ 40 % within three years, like real ones). */
const YOUNG_FAILURE = 0.014;
/** Extra monthly failure chance while some of its routes are losing money. */
const LOSING_FAILURE = 0.03;
const YOUNG_YEARS = 3;
/** The player's hub attracts more startups (an interesting hub to the game, and big hubs did draw new airlines). */
const PLAYER_HUB_WEIGHT = 3;
const FIRST_ROUTES = [2, 4] as const;

const NAME_FIRST = ['Sky', 'Blue', 'Star', 'Sun', 'Aero', 'Nova', 'Swift', 'Silver', 'Alpine', 'Coastal', 'Metro', 'Air', 'Jet', 'Fly', 'Euro', 'Global', 'Spirit', 'Horizon', 'Comet', 'Falcon'];
const NAME_SECOND = ['Air', 'Jet', 'Wings', 'Link', 'Express', 'Airways', 'Connect', 'Line', 'Flyer', 'Air Lines'];

// (A game being created has no AI state yet.)
const startupsOf = (state: GameState): Record<string, StartupAirline> => state.ai?.startups ?? {};

/** The engine's view of a startup (no real routes: everything it flies is an AI-added route). */
export function startupAirline(s: StartupAirline): RealAirline {
  const [primary, secondary] = generatedColors(s.id);
  return {
    id: s.id,
    name: s.name,
    iata: s.iata,
    icao: s.icao,
    country: s.country,
    model: s.model,
    hubs: [s.base],
    bases: [],
    alliance: null,
    parent: null,
    brand: false,
    wikipedia: null,
    fleet: [],
    registered: [],
    colors: { primary, secondary, source: 'generated' },
    startup: { founded: toDate(s.founded).toISOString().slice(0, 10) },
  };
}

const overlays = new WeakMap<EngineWorld, { key: string; world: EngineWorld }>();
const OVERLAID = Symbol('startups');

/** The world with the game's startups added to its airlines (cached until a startup is founded). */
export function withStartups(world: EngineWorld, state: GameState): EngineWorld {
  const list = Object.values(startupsOf(state));
  const real = world.realAirlines;
  if (!list.length || !real || (world as { [OVERLAID]?: true })[OVERLAID]) return world;
  const key = list.map((s) => s.id).join(',');
  const known = overlays.get(world);
  if (known?.key === key) return known.world;
  const byId = new Map(real.byId);
  for (const s of list) byId.set(s.id, startupAirline(s));
  const overlay: RealAirlines = { ...real, byId, routesOf: (id) => (id.startsWith('*') ? [] : real.routesOf(id)) };
  const result = { ...world, realAirlines: overlay, [OVERLAID]: true } as EngineWorld;
  overlays.set(world, { key, world: result });
  return result;
}

/** Monthly: maybe a new airline somewhere; young or losing startups may fail. */
export function startupsMonthly(state: GameState, world: EngineWorld): void {
  const real = world.realAirlines;
  if (!real) return;
  failStartups(state);
  const date = toDate(state.time);
  const day = date.toISOString().slice(0, 10);
  const player = Object.values(state.airlines).find((a) => a.controller === 'human');
  // Candidate bases: busy airports in countries whose domestic market is free, weighted by their people.
  const candidates: [Airport, number][] = [];
  let all = 0;
  for (const a of world.airportById.values()) {
    if (a.size === 'small') continue;
    const weight = a.marketPop * (a.id === player?.hubId ? PLAYER_HUB_WEIGHT : 1);
    all += a.marketPop;
    if (faresFreeFrom(a.country, a.country) <= day) candidates.push([a, weight]);
  }
  const free = candidates.reduce((s, [, w]) => s + w, 0);
  if (!free || random(state) >= (STARTUPS_PER_YEAR / 12) * Math.min(1, free / Math.max(1, all))) return;
  let pick = random(state) * free;
  const base = candidates.find(([, w]) => (pick -= w) < 0)?.[0] ?? candidates[0]![0];
  found(state, world, base);
}

function found(state: GameState, world: EngineWorld, base: Airport): void {
  const real = world.realAirlines!;
  const year = yearOf(state.time);
  const continent = world.countries[base.country]?.continent ?? '';
  const lowCostEra = year >= (LOW_COST_FROM[continent] ?? 2004);
  const r = random(state);
  const model: BusinessModel = lowCostEra && r < 0.6 ? 'lowcost' : r < 0.75 ? 'regional' : r < 0.9 ? 'charter' : 'legacy';
  const n = Object.keys(startupsOf(state)).length + 1;
  const startup: StartupAirline = {
    id: `*S${n}`,
    name: uniqueName(state, real),
    iata: uniqueCode(state, real, 2),
    icao: uniqueCode(state, real, 3),
    country: base.country,
    model,
    base: base.id,
    founded: state.time,
  };
  const airline = startupAirline(startup);
  // Its first routes: the busiest markets from the base with the fewest airlines on them.
  const targets = [...new Set(real.routesAt(base.id).map((x) => (x.a === base.id ? x.b : x.a)))]
    .map((id) => world.airportById.get(id))
    .filter((b): b is Airport => !!b)
    .map((b) => {
      const m = market(world, base, b);
      const others = competitorsOn(world, base, b, m, state.ai)?.length ?? 0;
      const fits = (model !== 'regional' || m.distanceKm <= 1500) && !!aircraftFor(airline, m.distanceKm, year);
      return { b, score: fits ? m.weeklyPax / (others + 1) : 0, pax: m.weeklyPax, others };
    })
    .filter((x) => x.score > 0 && x.pax >= 200)
    .sort((x, y) => y.score - x.score);
  const count = FIRST_ROUTES[0] + Math.floor(random(state) * (FIRST_ROUTES[1] - FIRST_ROUTES[0] + 1));
  const first = targets.slice(0, count);
  if (!first.length) return;
  (state.ai.startups ??= {})[startup.id] = startup;
  state.ai.airlines[startup.id] = { status: 'active', health: 0, since: state.time };
  for (const t of first) {
    const weekly = Math.max(2, Math.min(model === 'charter' ? 3 : 7, Math.round((t.pax / (t.others + 1) / 150) * 2) / 2));
    state.ai.routes[aiRouteKey(startup.id, base.id, t.b.id)] = { weeklyAB: weekly, weeklyBA: weekly, fare: MODEL_FARE[model], added: true, badReviews: 0, since: state.time };
    const pair = base.id < t.b.id ? `${base.id}|${t.b.id}` : `${t.b.id}|${base.id}`;
    state.ai.added[pair] = [...new Set([...(state.ai.added[pair] ?? []), startup.id])];
  }
  postMessage(state, { airlineId: null, kind: 'startupFounded', level: 'info', params: { airline: startup.name, base: base.iata ?? base.id, routes: first.length } });
}

function failStartups(state: GameState): void {
  const playerPairs = new Set(Object.values(state.routes).map((r) => aiRouteKey('', r.originId, r.destinationId)));
  for (const s of Object.values(startupsOf(state))) {
    const status = state.ai.airlines[s.id];
    if (!status || status.status !== 'active') continue;
    const routes = Object.entries(state.ai.routes).filter(([k, r]) => k.startsWith(`${s.id}|`) && !r.closed);
    const young = state.time - s.founded < YOUNG_YEARS * 365 * MINUTES_PER_DAY;
    const losing = routes.some(([, r]) => r.badReviews > 0);
    const odds = !routes.length ? 1 : (young ? YOUNG_FAILURE : 0) + (losing ? LOSING_FAILURE : 0);
    if (odds > 0 && random(state) < odds) {
      status.status = 'bankrupt';
      status.since = state.time;
      for (const [, r] of routes) r.closed = true;
      const atPlayer = routes.some(([k]) => playerPairs.has(k.slice(s.id.length)));
      postMessage(state, { airlineId: null, kind: 'aiBankrupt', level: atPlayer ? 'caution' : 'info', params: { airline: s.name, routes: routes.length } });
    }
  }
}

function uniqueName(state: GameState, real: RealAirlines): string {
  const taken = new Set([...real.byId.values()].map((a) => a.name.toLowerCase()));
  for (const s of Object.values(startupsOf(state))) taken.add(s.name.toLowerCase());
  for (let i = 0; i < 50; i++) {
    const first = NAME_FIRST[Math.floor(random(state) * NAME_FIRST.length)]!;
    const second = NAME_SECOND[Math.floor(random(state) * NAME_SECOND.length)]!;
    if (second.split(' ').includes(first)) continue;
    const name = random(state) < 0.3 && !second.includes(' ') ? `${first}${second.toLowerCase()}` : `${first} ${second}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return `New Air ${Object.keys(startupsOf(state)).length + 1}`;
}

function uniqueCode(state: GameState, real: RealAirlines, length: 2 | 3): string {
  const taken = new Set<string>();
  for (const a of real.byId.values()) for (const c of [a.iata, a.icao]) if (c) taken.add(c);
  for (const s of Object.values(startupsOf(state))) taken.add(s.iata).add(s.icao);
  for (const a of Object.values(state.airlines)) taken.add(a.iata).add(a.icao);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < 500; i++) {
    let code = '';
    for (let k = 0; k < length; k++) code += letters[Math.floor(random(state) * 26)];
    if (!taken.has(code)) return code;
  }
  return length === 2 ? 'ZZ' : 'ZZZ';
}

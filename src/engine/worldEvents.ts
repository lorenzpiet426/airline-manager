// The world around the airlines (Phase 5.1): the economy, the jet fuel price and exchange rates after the real data
// ends, and events that happen at their real-world frequencies — recessions, fuel shocks, pandemics, volcanic ash,
// airspace closures, air traffic control and airport strikes, winter storms, hurricanes and typhoons. Until the real data
// ends (October 2026) the world follows the real fuel prices and has no invented events; the real event timeline of
// the past comes in Phase 5.2. All randomness uses the game's seeded generator, so a save always plays out the same.
import { jetFuelSpot } from '../data/fuel';
import type { Airport } from '../data/types';
import { postMessage } from './core';
import { random } from './rng';
import type { GameState, WorldEvent, WorldEventKind, WorldState } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, toDate, type SimTime } from './time';
import { seedOf } from './timetable';
import type { EngineWorld } from './world';

const DAY = MINUTES_PER_DAY;
const YEAR = 365.25 * DAY;

/** The real data (EIA fuel prices, ECB exchange rates) ends here; from now on the world is simulated. */
export const REAL_DATA_END = simTime(2026, 10, 24);

/** Air travel grows about 3 % a year in the long run (IATA, ICAO long-term forecasts). */
export const TRAFFIC_GROWTH = 0.03;
/** Long-run jet fuel price (USD per gallon, 2026 dollars) the simulated price drifts back to, rising with inflation. */
const FUEL_LONG_RUN = 2.4;
const FUEL_INFLATION = 0.025;
/** Daily mean reversion and volatility of the fuel price (≈ 35 % a year, like the real jet fuel market). */
const FUEL_REVERSION = 0.02 / 7;
const FUEL_VOLATILITY = 0.045 / Math.sqrt(7);

/** Currencies that don't float freely: pegged to the US dollar or the euro (or tightly managed). */
const PEG_USD = new Set(['HKD', 'AED', 'SAR', 'QAR', 'OMR', 'BHD', 'JOD', 'PAB']);
const PEG_EUR = new Set(['DKK', 'BGN', 'XOF', 'XAF']);
/** Monthly volatility vs the US dollar and long-run drift (Turkish lira: decades of high inflation). */
const FX_VOLATILITY: Record<string, number> = { CNY: 0.01, TRY: 0.04, BRL: 0.04, ZAR: 0.035, ARS: 0.06, INR: 0.015, IDR: 0.025 };
const FX_DRIFT: Record<string, number> = { TRY: 0.02, ARS: 0.04, BRL: 0.003, ZAR: 0.003, INR: 0.002 };

export function newWorldState(fx: Record<string, number>): WorldState {
  const usd = fx.USD ?? 1;
  return {
    fuel: jetFuelSpot(toDate(REAL_DATA_END)),
    fuelHistory: [],
    fxBase: Object.fromEntries(Object.entries(fx).map(([c, r]) => [c, r / usd])),
    fxHistory: [],
    events: [],
  };
}

// ─── Event catalogue ───────────────────────────────────────────────────────────

/** Countries with airspace closures in the 2010s–2020s (closures are drawn from these, neutrally worded). */
const AIRSPACE_RISK = ['UA', 'RU', 'BY', 'SY', 'LY', 'IQ', 'IR', 'YE', 'SD', 'AF', 'PK', 'IL', 'LB', 'VE', 'ML', 'NE', 'ET', 'MM', 'KP', 'SO'];
/** Western European countries an Icelandic ash cloud can close (2010: most of them for six days). */
const ASH_EUROPE = ['GB', 'IE', 'NO', 'DK', 'NL', 'BE', 'DE', 'FR', 'SE', 'FI', 'LU', 'PL', 'CH', 'AT', 'CZ'];

interface Spawn {
  kind: WorldEventKind;
  /** Events per year (or per season for weather). */
  perYear: number;
  /** Months it can start in (default: all). */
  months?: number[];
  make: (state: GameState, world: EngineWorld) => Omit<WorldEvent, 'id' | 'kind' | 'start'> | null;
}

const between = (state: GameState, a: number, b: number) => a + random(state) * (b - a);
const pickOne = <T,>(state: GameState, items: readonly T[]): T => items[Math.floor(random(state) * items.length)]!;
const CONTINENTS = ['EU', 'NA', 'AS', 'SA', 'AF', 'OC'];

/** Large and medium airports in a box, with a centre airport and its neighbours within `km`. */
function airportsAround(world: EngineWorld, state: GameState, filter: (a: Airport) => boolean, km: number, max: number): string[] {
  const pool = [...world.airportById.values()].filter((a) => a.size === 'large' && filter(a));
  if (!pool.length) return [];
  const centre = pickOne(state, pool);
  const near = [...world.airportById.values()]
    .filter((a) => a.size !== 'small' && filter(a))
    .map((a) => ({ a, d: Math.hypot((a.lat - centre.lat) * 111, (a.lon - centre.lon) * 111 * Math.cos((centre.lat * Math.PI) / 180)) }))
    .filter((x) => x.d <= km)
    .sort((x, y) => x.d - y.d)
    .slice(0, max);
  return near.map((x) => x.a.id);
}

const strike = (country: string, share: [number, number], days: [number, number]) => (state: GameState) => ({
  end: 0,
  days: Math.round(between(state, days[0], days[1] + 0.99)),
  countries: [country],
  depth: between(state, share[0], share[1]),
});

const SPAWNS: Spawn[] = [
  // Economy: a world recession every ~20 years, regional ones more often.
  { kind: 'recession', perYear: 0.05, make: (s) => ({ end: 0, days: between(s, 365, 730), continents: CONTINENTS, depth: between(s, 0.1, 0.18) }) },
  { kind: 'recession', perYear: 0.2, make: (s) => ({ end: 0, days: between(s, 270, 540), continents: [pickOne(s, CONTINENTS)], depth: between(s, 0.06, 0.12) }) },
  { kind: 'fuelShock', perYear: 0.1, make: (s) => ({ end: 0, days: between(s, 60, 240), depth: between(s, 0.4, 0.9) }) },
  // Pandemics: smaller outbreaks every decade or two, a severe one about once a century.
  { kind: 'pandemic', perYear: 0.05, make: (s) => ({ end: 0, days: between(s, 90, 240), continents: [pickOne(s, ['AS', 'AS', 'NA', 'AF', 'SA', 'EU'])], depth: between(s, 0.1, 0.3) }) },
  { kind: 'pandemicSevere', perYear: 0.012, make: (s) => ({ end: 0, days: between(s, 540, 1100), continents: CONTINENTS, depth: between(s, 0.75, 0.92) }) },
  // Volcanic ash.
  {
    kind: 'volcano',
    perYear: 0.06,
    make: (s) => {
      const extra = ASH_EUROPE.filter(() => random(s) < 0.45);
      return { end: 0, days: between(s, 2, 8), countries: ['IS', 'GB', 'IE', ...extra.filter((c) => c !== 'GB' && c !== 'IE')], depth: 0.9, label: pickOne(s, ['Katla', 'Hekla', 'Grímsvötn', 'Bárðarbunga']) };
    },
  },
  { kind: 'volcano', perYear: 0.4, make: (s) => ({ end: 0, days: between(s, 1, 2.5), airports: ['LICC', 'LICJ'], depth: 1, label: 'Etna' }) },
  { kind: 'volcano', perYear: 0.25, make: (s) => ({ end: 0, days: between(s, 2, 5), airports: ['WADD', 'WADL'], depth: 1, label: 'Agung' }) },
  { kind: 'volcano', perYear: 0.05, make: (s) => ({ end: 0, days: between(s, 5, 20), countries: ['AR', 'UY'], depth: 0.6, label: 'Puyehue' }) },
  // Airspace closed for security reasons (one country, weeks to years).
  {
    kind: 'airspace',
    perYear: 0.04,
    make: (s) => {
      const closed = new Set(s.world.events.filter((e) => e.kind === 'airspace' && e.end > s.time).flatMap((e) => e.countries ?? []));
      const options = AIRSPACE_RISK.filter((c) => !closed.has(c));
      return options.length ? { end: 0, days: between(s, 30, 900), countries: [pickOne(s, options)], depth: 1 } : null;
    },
  },
  // Strikes: French air traffic control strikes are the most frequent in Europe.
  { kind: 'atcStrike', perYear: 4, make: strike('FR', [0.3, 0.6], [1, 2]) },
  { kind: 'atcStrike', perYear: 1.5, make: strike('IT', [0.3, 0.5], [1, 1]) },
  { kind: 'atcStrike', perYear: 0.5, make: strike('GR', [0.4, 0.8], [1, 1]) },
  { kind: 'atcStrike', perYear: 0.5, make: strike('BE', [0.5, 0.9], [1, 1]) },
  { kind: 'atcStrike', perYear: 0.3, make: strike('ES', [0.2, 0.4], [1, 2]) },
  {
    kind: 'airportStrike',
    perYear: 1.5,
    make: (s) => {
      const all = ['EDDF', 'EDDM', 'EDDH', 'EDDL', 'EDDB', 'EDDS', 'EDDK', 'EDDV'];
      // Frankfurt is always part of it; the others join at random.
      return { end: 0, days: 1, airports: ['EDDF', ...all.slice(1).filter(() => random(s) < 0.5)], depth: between(s, 0.7, 0.95) };
    },
  },
  { kind: 'airportStrike', perYear: 0.5, make: (s) => ({ end: 0, days: 1, airports: [pickOne(s, ['EGLL', 'EGKK', 'EGCC'])], depth: between(s, 0.2, 0.4) }) },
  { kind: 'airportStrike', perYear: 0.5, make: (s) => ({ end: 0, days: 1, airports: ['EFHK'], depth: between(s, 0.6, 0.9) }) },
  // Weather: winter storms in the northern winter, hurricanes and typhoons in their seasons.
  ...(['EU', 'NA', 'AS'] as const).map(
    (region): Spawn => ({
      kind: 'winterStorm',
      perYear: 3,
      months: [12, 1, 2],
      make: (s, w) => {
        const continent = (a: Airport) => w.countries[a.country]?.continent;
        const filter = (a: Airport) =>
          // Europe west of the Urals (Russia counts as Europe in the country table).
          region === 'EU' ? continent(a) === 'EU' && a.lat > 45 && a.lon < 45 : region === 'NA' ? continent(a) === 'NA' && a.lat > 38 : ['CN', 'JP', 'KR'].includes(a.country) && a.lat > 35;
        const airports = airportsAround(w, s, filter, 400, 4);
        return airports.length ? { end: 0, days: between(s, 1, 2), airports, depth: between(s, 0.3, 0.8) } : null;
      },
    }),
  ),
  {
    kind: 'hurricane',
    perYear: 2,
    months: [8, 9, 10],
    make: (s, w) => {
      const airports = airportsAround(w, s, (a) => a.lat > 15 && a.lat < 32 && a.lon > -100 && a.lon < -60, 300, 6);
      return airports.length ? { end: 0, days: between(s, 2, 4), airports, depth: 1 } : null;
    },
  },
  {
    kind: 'typhoon',
    perYear: 3,
    months: [7, 8, 9, 10],
    make: (s, w) => {
      const airports = airportsAround(w, s, (a) => a.lat > 10 && a.lat < 35 && a.lon > 110 && a.lon < 145, 250, 5);
      return airports.length ? { end: 0, days: between(s, 1, 2), airports, depth: 1 } : null;
    },
  },
];

/** Kinds whose effect builds up and fades (economy, health); the others simply close airports while they last. */
const GRADUAL: ReadonlySet<WorldEventKind> = new Set(['recession', 'fuelShock', 'pandemic', 'pandemicSevere']);
export const CLOSING: ReadonlySet<WorldEventKind> = new Set(['volcano', 'airspace', 'atcStrike', 'airportStrike', 'winterStorm', 'hurricane', 'typhoon']);

/** How strong an event is at `time` (0–1): gradual events rise over the first fifth, hold, then recover. */
export function intensity(e: WorldEvent, time: SimTime): number {
  if (time < e.start || time >= e.end) return 0;
  if (!GRADUAL.has(e.kind)) return 1;
  const x = (time - e.start) / (e.end - e.start);
  return x < 0.2 ? x / 0.2 : x < 0.5 ? 1 : 1 - (x - 0.5) / 0.5;
}

// ─── Conditions: what the economics model needs ────────────────────────────────

export interface Conditions {
  /** Jet fuel spot price (USD per gallon). */
  fuelSpot: number;
  /** Long-term traffic growth since the real data (demand and the competitors' capacity grow alike). */
  trend: number;
  /** Demand multiplier for travellers between two airports (recessions, pandemics). */
  demand: (a: Airport, b: Airport, segment: 'business' | 'leisure') => number;
}

const NEUTRAL: Conditions = { fuelSpot: 0, trend: 1, demand: () => 1 };

/** The world's conditions at `time` (the real fuel price until the real data ends, then the simulated one). */
export function conditionsOf(state: GameState, world: EngineWorld, time = state.time): Conditions {
  const w = state.world;
  if (!w) return { ...NEUTRAL, fuelSpot: jetFuelSpot(toDate(time)) };
  const active = w.events.filter((e) => GRADUAL.has(e.kind) && e.start <= time && e.end > time && e.kind !== 'fuelShock');
  return {
    fuelSpot: time < REAL_DATA_END ? jetFuelSpot(toDate(time)) : w.fuel,
    trend: (1 + TRAFFIC_GROWTH) ** Math.max(0, (time - REAL_DATA_END) / YEAR),
    demand: active.length
      ? (a, b, segment) => {
          let f = 1;
          const international = a.country !== b.country;
          const ca = world.countries[a.country]?.continent ?? '';
          const cb = world.countries[b.country]?.continent ?? '';
          for (const e of active) {
            const i = intensity(e, time) * e.depth;
            const where = ((e.continents ?? []).includes(ca) ? 0.5 : 0) + ((e.continents ?? []).includes(cb) ? 0.5 : 0);
            if (e.kind === 'recession') f *= 1 - i * where * (segment === 'business' ? 1.4 : 0.8);
            else if (e.kind === 'pandemic') f *= 1 - i * Math.max(0.5, where) * (international ? 1 : 0.5);
            else if (e.kind === 'pandemicSevere') f *= 1 - i * (international ? 1 : 0.6);
          }
          return Math.max(0.03, f);
        }
      : () => 1,
  };
}

/** Share of flights cancelled at an airport at `time` (0–1) by closures and strikes, and the events causing it. */
export function closureAt(state: GameState, airport: Airport | undefined, time: SimTime): { share: number; events: WorldEvent[] } {
  const events = (state.world?.events ?? []).filter(
    (e) => CLOSING.has(e.kind) && e.start <= time && e.end > time && airport && ((e.airports ?? []).includes(airport.id) || (e.countries ?? []).includes(airport.country)),
  );
  return { share: events.reduce((m, e) => Math.max(m, e.depth), 0), events };
}

/** Is a flight leaving at `dep` from `a` to `b` cancelled? Partial closures cancel a stable share of flights. */
export function closureCancels(state: GameState, world: EngineWorld, fromId: string, toId: string, dep: SimTime, key: string): WorldEvent | null {
  for (const id of [fromId, toId]) {
    const c = closureAt(state, world.airportById.get(id), dep);
    if (c.share > 0 && (c.share >= 1 || (seedOf(`${key}|${startOfDay(dep)}`) % 1000) / 1000 < c.share)) return c.events[0]!;
  }
  return null;
}

// ─── Daily and monthly steps ───────────────────────────────────────────────────

/** Daily: the fuel price moves, events start and end. Called at 00:00 UTC. */
export function worldDailyStep(state: GameState, world: EngineWorld): void {
  const w = state.world;
  if (!w || state.time < REAL_DATA_END) return;
  // Fuel: drifts back to its long-run level (higher during fuel shocks) with daily noise.
  const years = (state.time - REAL_DATA_END) / YEAR;
  const shock = w.events.filter((e) => e.kind === 'fuelShock').reduce((m, e) => m * (1 + e.depth * intensity(e, state.time)), 1);
  const target = FUEL_LONG_RUN * (1 + FUEL_INFLATION) ** years * shock;
  const noise = (random(state) + random(state) + random(state) - 1.5) * 2; // ≈ normal, σ ≈ 1
  w.fuel = Math.exp(Math.log(w.fuel) + FUEL_REVERSION * (Math.log(target) - Math.log(w.fuel)) + FUEL_VOLATILITY * noise);
  if (new Date(toDate(state.time)).getUTCDay() === 1) {
    w.fuelHistory.push([state.time, Math.round(w.fuel * 1000) / 1000]);
    if (w.fuelHistory.length > 520) w.fuelHistory.splice(0, w.fuelHistory.length - 520);
  }

  // New events (each kind at its yearly rate, in its season).
  const month = toDate(state.time).getUTCMonth() + 1;
  for (const spawn of SPAWNS) {
    const perDay = spawn.months ? spawn.perYear / (spawn.months.length * 30.4) : spawn.perYear / 365.25;
    if ((spawn.months && !spawn.months.includes(month)) || random(state) >= perDay) continue;
    const made = spawn.make(state, world) as (Omit<WorldEvent, 'id' | 'kind' | 'start'> & { days?: number }) | null;
    if (!made) continue;
    const { days, ...rest } = made;
    const start = state.time;
    const event: WorldEvent = { ...rest, id: `W${state.nextId++}`, kind: spawn.kind, start, end: start + Math.max(1, days ?? 1) * DAY };
    if (event.kind === 'fuelShock') w.fuel *= 1 + event.depth * 0.3;
    w.events.push(event);
    announce(state, world, event);
  }
  // Events over for more than two years are forgotten.
  w.events = w.events.filter((e) => e.end > state.time - 2 * YEAR);
}

/** Monthly: floating currencies move against the US dollar; the dollar moves against the euro. */
export function worldMonthlyStep(state: GameState): void {
  const w = state.world;
  if (!w || state.time < REAL_DATA_END) return;
  const normal = () => (random(state) + random(state) + random(state) - 1.5) * 2;
  const years = (state.time - REAL_DATA_END) / YEAR;
  const walk = (now: number, base: number, sigma: number, drift: number) =>
    Math.exp(Math.log(now) + 0.03 * (Math.log(base * (1 + drift) ** (years * 12)) - Math.log(now)) + sigma * normal());
  // EUR/USD (the game stores units per euro).
  const usdPerEur = walk(state.fx.USD ?? 1, w.fxBase.EUR ? 1 / w.fxBase.EUR : (state.fx.USD ?? 1), 0.022, 0);
  const fx: Record<string, number> = { EUR: 1, USD: usdPerEur };
  for (const [c, rate] of Object.entries(state.fx)) {
    if (c === 'EUR' || c === 'USD') continue;
    const vsUsd = rate / (state.fx.USD ?? 1);
    if (PEG_USD.has(c)) fx[c] = (w.fxBase[c] ?? vsUsd) * usdPerEur;
    else if (PEG_EUR.has(c)) fx[c] = rate;
    else fx[c] = walk(vsUsd, w.fxBase[c] ?? vsUsd, FX_VOLATILITY[c] ?? 0.022, FX_DRIFT[c] ?? 0) * usdPerEur;
  }
  state.fx = Object.fromEntries(Object.entries(fx).map(([c, r]) => [c, Math.round(r * 10_000) / 10_000]));
  state.fxDate = toDate(state.time).toISOString().slice(0, 10);
  w.fxHistory.push([state.time, state.fx.USD!]);
  if (w.fxHistory.length > 600) w.fxHistory.splice(0, w.fxHistory.length - 600);
}

/** World news for the event, and a message to every player airline whose network it touches. */
function announce(state: GameState, world: EngineWorld, e: WorldEvent): void {
  const area = e.airports?.length ? 'airports' : e.countries?.length ? 'countries' : e.continents?.length === CONTINENTS.length ? 'world' : 'continents';
  const where = e.airports?.length ? e.airports.map((id) => world.airportById.get(id)?.iata ?? id).join(',') : (e.countries ?? e.continents ?? []).join(',');
  const params = { event: e.kind, area, where, until: e.end, label: e.label ?? '', depth: Math.round(e.depth * 100) };
  postMessage(state, { airlineId: null, kind: 'worldEvent', level: e.kind === 'pandemicSevere' || e.kind === 'airspace' ? 'warning' : 'info', params });
  if (!CLOSING.has(e.kind)) return;
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human') continue;
    const touched = Object.values(state.routes).some(
      (r) => r.airlineId === airline.id && [r.originId, r.destinationId].some((id) => closureAt(state, world.airportById.get(id), e.start).events.includes(e)),
    );
    if (touched) postMessage(state, { airlineId: airline.id, kind: 'eventAffects', level: 'caution', params });
  }
}

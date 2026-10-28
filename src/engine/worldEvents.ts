// The world around the airlines (Phase 5.1): the economy, the jet fuel price and exchange rates after the real data
// ends, and events that happen at their real-world frequencies — recessions, fuel shocks, pandemics, volcanic ash,
// airspace closures, air traffic control and airport strikes, winter storms, hurricanes and typhoons. Until the real data
// ends (October 2026) the world follows the real fuel prices and the real event timeline since 1970 (Phase 5.2,
// data/history.ts); only small random events (storms, short strikes) are added there. Air travel before 2024 follows the
// economy data (data/economyHistory.ts). All randomness uses the game's seeded generator, so a save always plays out the same.
import { demandIndex, worldDemandIndex } from '../data/economyHistory';
import { jetFuelSpot } from '../data/fuel';
import { HISTORIC_EVENTS } from '../data/history';
import type { Airport } from '../data/types';
import { postMessage } from './core';
import { random } from './rng';
import type { GameState, WorldEvent, WorldEventKind, WorldState } from './state';
import { fromDate, MINUTES_PER_DAY, simTime, startOfDay, toDate, type SimTime } from './time';
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
  /** Small events nobody records one by one: they also happen at random in the real past (from `since`). */
  small?: boolean;
  since?: number;
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
  { kind: 'volcano', perYear: 0.4, small: true, make: (s) => ({ end: 0, days: between(s, 1, 2.5), airports: ['LICC', 'LICJ'], depth: 1, label: 'Etna' }) },
  { kind: 'volcano', perYear: 0.25, make: (s) => ({ end: 0, days: between(s, 2, 5), airports: ['WADD', 'WADL'], depth: 1, label: 'Agung' }) },
  { kind: 'volcano', perYear: 0.05, make: (s) => ({ end: 0, days: between(s, 5, 20), countries: ['AR', 'UY'], depth: 0.6, label: 'Puyehue' }) },
  // Airspace closed for security reasons (one country, weeks to years).
  {
    kind: 'airspace',
    perYear: 0.04,
    make: (s) => {
      const closed = new Set(eventsOf(s).filter((e) => e.kind === 'airspace' && e.start <= s.time && e.end > s.time).flatMap((e) => e.countries ?? []));
      const options = AIRSPACE_RISK.filter((c) => !closed.has(c));
      return options.length ? { end: 0, days: between(s, 30, 900), countries: [pickOne(s, options)], depth: 1 } : null;
    },
  },
  // Strikes: French air traffic control strikes are the most frequent in Europe.
  { kind: 'atcStrike', perYear: 4, small: true, make: strike('FR', [0.3, 0.6], [1, 2]) },
  { kind: 'atcStrike', perYear: 1.5, small: true, make: strike('IT', [0.3, 0.5], [1, 1]) },
  { kind: 'atcStrike', perYear: 0.5, small: true, make: strike('GR', [0.4, 0.8], [1, 1]) },
  { kind: 'atcStrike', perYear: 0.5, small: true, make: strike('BE', [0.5, 0.9], [1, 1]) },
  { kind: 'atcStrike', perYear: 0.3, small: true, make: strike('ES', [0.2, 0.4], [1, 2]) },
  {
    kind: 'airportStrike',
    perYear: 1.5,
    // German warning strikes at many airports on one day are a 2010s–2020s pattern.
    small: true,
    since: 2012,
    make: (s) => {
      const all = ['EDDF', 'EDDM', 'EDDH', 'EDDL', 'EDDB', 'EDDS', 'EDDK', 'EDDV'];
      // Frankfurt is always part of it; the others join at random.
      return { end: 0, days: 1, airports: ['EDDF', ...all.slice(1).filter(() => random(s) < 0.5)], depth: between(s, 0.7, 0.95) };
    },
  },
  { kind: 'airportStrike', perYear: 0.5, small: true, make: (s) => ({ end: 0, days: 1, airports: [pickOne(s, ['EGLL', 'EGKK', 'EGCC'])], depth: between(s, 0.2, 0.4) }) },
  { kind: 'airportStrike', perYear: 0.5, small: true, make: (s) => ({ end: 0, days: 1, airports: ['EFHK'], depth: between(s, 0.6, 0.9) }) },
  // Weather: winter storms in the northern winter, hurricanes and typhoons in their seasons.
  ...(['EU', 'NA', 'AS'] as const).map(
    (region): Spawn => ({
      kind: 'winterStorm',
      perYear: 3,
      small: true,
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
    small: true,
    months: [8, 9, 10],
    make: (s, w) => {
      const airports = airportsAround(w, s, (a) => a.lat > 15 && a.lat < 32 && a.lon > -100 && a.lon < -60, 300, 6);
      return airports.length ? { end: 0, days: between(s, 2, 4), airports, depth: 1 } : null;
    },
  },
  {
    kind: 'typhoon',
    perYear: 3,
    small: true,
    months: [7, 8, 9, 10],
    make: (s, w) => {
      const airports = airportsAround(w, s, (a) => a.lat > 10 && a.lat < 35 && a.lon > 110 && a.lon < 145, 250, 5);
      return airports.length ? { end: 0, days: between(s, 1, 2), airports, depth: 1 } : null;
    },
  },
];

/** Kinds whose effect builds up and fades (economy, health, crises); the others simply close airports while they last. */
const GRADUAL: ReadonlySet<WorldEventKind> = new Set(['recession', 'fuelShock', 'pandemic', 'pandemicSevere', 'crisis']);
export const CLOSING: ReadonlySet<WorldEventKind> = new Set([
  'volcano', 'airspace', 'atcStrike', 'airportStrike', 'winterStorm', 'hurricane', 'typhoon', 'flightBan', 'disruption',
]);

/**
 * How strong an event is at `time` (0–1): its own profile if it has one; otherwise gradual events rise over the first
 * fifth, hold, then recover, and closures are full strength while they last.
 */
export function intensity(e: WorldEvent, time: SimTime): number {
  if (time < e.start || time >= e.end) return 0;
  if (e.profile?.length) {
    const p = e.profile;
    if (time <= p[0]![0]) return p[0]![1];
    for (let k = 1; k < p.length; k++) {
      const [t1, v1] = p[k]!;
      if (time <= t1) {
        const [t0, v0] = p[k - 1]!;
        return t1 === t0 ? v1 : v0 + ((v1 - v0) * (time - t0)) / (t1 - t0);
      }
    }
    return p.at(-1)![1];
  }
  if (!GRADUAL.has(e.kind)) return 1;
  const x = (time - e.start) / (e.end - e.start);
  return x < 0.2 ? x / 0.2 : x < 0.5 ? 1 : 1 - (x - 0.5) / 0.5;
}

// ─── The real history ──────────────────────────────────────────────────────────

const dayOf = (iso: string): SimTime => fromDate(new Date(`${iso}T00:00:00Z`));
let historicCache: { seed: number; events: WorldEvent[] } | null = null;

/**
 * The real events as world events of this game. Events still going on when the real data ends get an end date of
 * their own per game (3 months to 3 years later), because nobody knows when they will really end.
 */
export function historicEvents(seed: number): WorldEvent[] {
  if (historicCache?.seed === seed) return historicCache.events;
  const events = HISTORIC_EVENTS.map((h): WorldEvent => {
    const start = dayOf(h.start);
    const openEnd = REAL_DATA_END + Math.round(90 + ((seedOf(`${h.id}|${seed}`) % 1000) / 1000) * 1000) * DAY;
    const end = h.end ? dayOf(h.end) + DAY : openEnd;
    return {
      id: `H-${h.id}`,
      kind: h.kind,
      start,
      end,
      depth: h.depth,
      historic: h.id,
      ...(h.continents && { continents: h.continents }),
      ...(h.countries && { countries: h.countries }),
      ...(h.airports && { airports: h.airports }),
      ...(h.pairWith && { pairWith: h.pairWith }),
      ...(h.local && { local: true }),
      ...(!h.end && { openEnded: true }),
      ...(h.label && { label: h.label }),
      ...(h.profile && { profile: [...h.profile.map(([d, v]): [SimTime, number] => [dayOf(d), v]), ...(h.end ? [] : [[end, h.profile.at(-1)![1]] as [SimTime, number]])] }),
    };
  });
  historicCache = { seed, events };
  return events;
}

/** All events of a game: the real ones and the simulated ones. */
export function eventsOf(state: GameState): WorldEvent[] {
  return state.world ? [...historicEvents(state.seed), ...state.world.events] : historicEvents(state.seed);
}

/** Is an airport inside an event's area? */
function inArea(e: WorldEvent, a: Airport, world: EngineWorld): boolean {
  return (e.airports ?? []).includes(a.id) || (e.countries ?? []).includes(a.country) || (e.continents ?? []).includes(world.countries[a.country]?.continent ?? '');
}

// ─── Conditions: what the economics model needs ────────────────────────────────

export interface Conditions {
  /** Jet fuel spot price (USD per gallon). */
  fuelSpot: number;
  /** Air travel worldwide compared with the real data (before: the economy history; after: long-term growth). */
  trend: number;
  /** The same for travel between two airports (before 2024 each country's economy history counts). */
  growth: (a: Airport, b: Airport) => number;
  /** Demand multiplier for travellers between two airports (recessions, pandemics). */
  demand: (a: Airport, b: Airport, segment: 'business' | 'leisure') => number;
}

/** Calendar year as a fraction (e.g. 1985.5 = 1 July 1985). */
const fractionalYear = (time: SimTime) => {
  const d = toDate(time);
  return d.getUTCFullYear() + (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / (365.25 * 86_400_000);
};

/** The world's conditions at `time` (the real fuel price until the real data ends, then the simulated one). */
export function conditionsOf(state: GameState, world: EngineWorld, time = state.time): Conditions {
  const w = state.world;
  const active = eventsOf(state).filter((e) => GRADUAL.has(e.kind) && e.start <= time && e.end > time && e.kind !== 'fuelShock');
  const after = (1 + TRAFFIC_GROWTH) ** Math.max(0, (time - REAL_DATA_END) / YEAR);
  const year = fractionalYear(time);
  const past = year < 2025;
  return {
    fuelSpot: time < REAL_DATA_END || !w ? jetFuelSpot(toDate(time)) : w.fuel,
    trend: past ? worldDemandIndex(year) : after,
    growth: past ? (a, b) => Math.sqrt(demandIndex(a.country, year) * demandIndex(b.country, year)) : () => after,
    demand: active.length
      ? (a, b, segment) => {
          let f = 1;
          const international = a.country !== b.country;
          for (const e of active) {
            const i = intensity(e, time) * e.depth;
            const where = (inArea(e, a, world) ? 0.5 : 0) + (inArea(e, b, world) ? 0.5 : 0);
            // Random outbreaks and pandemics spread everywhere; everything else stays where it happens.
            const spreads = !e.local && (e.kind === 'pandemic' || e.kind === 'pandemicSevere');
            if (!where && !spreads) continue;
            if (e.kind === 'recession') f *= 1 - i * where * (segment === 'business' ? 1.4 : 0.8);
            else if (e.kind === 'pandemic') f *= 1 - i * (e.local ? where : Math.max(0.5, where)) * (international ? 1 : 0.5);
            else if (e.kind === 'pandemicSevere') f *= 1 - i * (e.local ? where : 1) * (international ? 1 : 0.75);
            else if (e.kind === 'crisis') f *= 1 - i * where * (international ? 1 : 0.6);
          }
          return Math.max(0.03, f);
        }
      : () => 1,
  };
}

/**
 * Share of flights cancelled at an airport at `time` (0–1) by closures and strikes, and the events causing it. Flight
 * bans only count for flights to/from their `pairWith` countries (`other` = the airport at the other end).
 */
export function closureAt(state: GameState, airport: Airport | undefined, time: SimTime, other?: Airport): { share: number; events: WorldEvent[] } {
  if (!airport) return { share: 0, events: [] };
  const events = eventsOf(state).filter(
    (e) =>
      CLOSING.has(e.kind) &&
      e.start <= time &&
      e.end > time &&
      ((e.airports ?? []).includes(airport.id) || (e.countries ?? []).includes(airport.country)) &&
      (!e.pairWith || (other !== undefined && e.pairWith.includes(other.country))),
  );
  return { share: events.reduce((m, e) => Math.max(m, e.depth * intensity(e, time)), 0), events };
}

/** Is a flight leaving at `dep` from `a` to `b` cancelled? Partial closures cancel a stable share of flights. */
export function closureCancels(state: GameState, world: EngineWorld, fromId: string, toId: string, dep: SimTime, key: string): WorldEvent | null {
  const from = world.airportById.get(fromId);
  const to = world.airportById.get(toId);
  for (const [here, there] of [[from, to], [to, from]] as const) {
    const c = closureAt(state, here, dep, there);
    if (c.share > 0 && (c.share >= 1 || (seedOf(`${key}|${startOfDay(dep)}`) % 1000) / 1000 < c.share)) return c.events[0]!;
  }
  return null;
}

// ─── Daily and monthly steps ───────────────────────────────────────────────────

/** Daily: the fuel price moves, events start and end. Called at 00:00 UTC. */
export function worldDailyStep(state: GameState, world: EngineWorld): void {
  const w = state.world;
  if (!w) return;
  // Real events starting today are in the news.
  for (const e of historicEvents(state.seed)) if (e.start <= state.time && e.start > state.time - DAY && e.kind !== 'milestone') announce(state, world, e);
  if (state.time < REAL_DATA_END) {
    spawnEvents(state, world, true);
    w.events = w.events.filter((e) => e.end > state.time - 2 * YEAR);
    return;
  }
  // Fuel: drifts back to its long-run level (higher during fuel shocks) with daily noise.
  const years = (state.time - REAL_DATA_END) / YEAR;
  const shock = eventsOf(state).filter((e) => e.kind === 'fuelShock').reduce((m, e) => m * (1 + e.depth * intensity(e, state.time)), 1);
  const target = FUEL_LONG_RUN * (1 + FUEL_INFLATION) ** years * shock;
  const noise = (random(state) + random(state) + random(state) - 1.5) * 2; // ≈ normal, σ ≈ 1
  w.fuel = Math.exp(Math.log(w.fuel) + FUEL_REVERSION * (Math.log(target) - Math.log(w.fuel)) + FUEL_VOLATILITY * noise);
  if (new Date(toDate(state.time)).getUTCDay() === 1) {
    w.fuelHistory.push([state.time, Math.round(w.fuel * 1000) / 1000]);
    if (w.fuelHistory.length > 520) w.fuelHistory.splice(0, w.fuelHistory.length - 520);
  }

  spawnEvents(state, world, false);
  // Events over for more than two years are forgotten.
  w.events = w.events.filter((e) => e.end > state.time - 2 * YEAR);
}

/** New random events (each kind at its yearly rate, in its season); in the real past only the small kinds. */
function spawnEvents(state: GameState, world: EngineWorld, smallOnly: boolean): void {
  const w = state.world!;
  const date = toDate(state.time);
  const month = date.getUTCMonth() + 1;
  for (const spawn of SPAWNS) {
    if (smallOnly && (!spawn.small || (spawn.since ?? 0) > date.getUTCFullYear())) continue;
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
  const params = { event: e.kind, area, where, until: e.end, label: e.label ?? '', depth: Math.round(e.depth * 100), historic: e.historic ?? '', open: e.openEnded ? 1 : 0 };
  postMessage(state, { airlineId: null, kind: 'worldEvent', level: e.kind === 'pandemicSevere' || e.kind === 'airspace' ? 'warning' : 'info', params });
  if (!CLOSING.has(e.kind)) return;
  for (const airline of Object.values(state.airlines)) {
    if (airline.controller !== 'human') continue;
    const touched = Object.values(state.routes).some(
      (r) =>
        r.airlineId === airline.id &&
        [
          [r.originId, r.destinationId],
          [r.destinationId, r.originId],
        ].some(([id, other]) => closureAt(state, world.airportById.get(id!), e.start, world.airportById.get(other!)).events.includes(e)),
    );
    if (touched) postMessage(state, { airlineId: airline.id, kind: 'eventAffects', level: 'caution', params });
  }
}

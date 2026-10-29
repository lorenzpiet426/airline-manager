// The world of a historical start year (Phase 5.3): which airports existed on a date, and the modelled national
// carriers that fly instead of today's real airlines (real airlines of earlier years come in Phase 6).
// Games starting in 2026 or later keep today's airports and real airlines; everything here is skipped for them.
import { demandIndex } from '../data/economyHistory';
import { EAST_GERMAN_AIRPORTS, eraLevels, fractionalYearOf, stateOf } from '../data/eras';
import { toDate, type SimTime } from './time';
import { generatedColors } from '../data/airlineColors';
import type { Airport } from '../data/types';
import type { BusinessModel, RealAirline, RealAirlines, RealRoute } from './realAirlines';

/** The first year with today's real airlines; earlier start years use modelled carriers. */
export const REAL_AIRLINES_FROM = 2026;
export const FIRST_START_YEAR = 1970;

export interface AirportHistory {
  /** Today's airport shown as the airport it replaced, until `until` (absent from `until` to `reopens`, if set). */
  replaced: { id: string; until: string; reopens?: string; wikipedia: string; airport: Airport }[];
  /** Old airports next to today's one, closed on `until`; their flights moved to `movedTo`. */
  closed: { until: string; movedTo: string; wikipedia: string; airport: Airport }[];
  /** Airports opened after 1970: [opening day, the airport that had the flights before]. */
  opened: Record<string, [string, string]>;
}

/** Then-year dollars per 2025 dollar at `time` (prices of aircraft, checks, refits …; 1 from 2025 on). */
export const priceLevelAt = (time: SimTime): number => eraLevels(fractionalYearOf(toDate(time))).prices;

const iso = (date: Date) => date.toISOString().slice(0, 10);

const changeDays = new WeakMap<AirportHistory, string[]>();

/** All the days on which the airport list changes, sorted. */
export function airportChangeDays(h: AirportHistory): string[] {
  const known = changeDays.get(h);
  if (known) return known;
  const days = [
    ...h.replaced.flatMap((r) => [r.until, ...(r.reopens ? [r.reopens] : [])]),
    ...h.closed.map((c) => c.until),
    ...Object.values(h.opened).map(([d]) => d),
  ].sort();
  changeDays.set(h, days);
  return days;
}

/** A short key that changes whenever the airport list does (worlds are cached by it). */
export function airportEraKey(h: AirportHistory, date: Date): number {
  const day = iso(date);
  const days = airportChangeDays(h);
  let n = 0;
  while (n < days.length && days[n]! <= day) n++;
  return n;
}

/** The airports of a date: replaced ones shown as their predecessor, later ones left out, closed old ones added. */
export function airportsAt(today: readonly Airport[], h: AirportHistory, date: Date): Airport[] {
  const day = iso(date);
  const replaced = new Map(h.replaced.filter((r) => day < r.until || (r.reopens !== undefined && day < r.reopens)).map((r) => [r.id, r]));
  const list: Airport[] = [];
  for (const a of today) {
    if (day < (h.opened[a.id]?.[0] ?? '')) continue;
    const r = replaced.get(a.id);
    if (!r) list.push(a);
    else if (day < r.until) list.push(r.airport);
    // Between closing and reopening (Nicosia → Larnaca) there is no airport.
  }
  for (const c of h.closed) if (day < c.until) list.push(c.airport);
  return list;
}

/**
 * Where today's airport `id` was on `date`: itself, the airport that had its flights before it opened, or null. Old
 * closed airports map to where their flights moved once they are closed.
 */
export function airportOnDate(h: AirportHistory, id: string, date: Date): string | null {
  const day = iso(date);
  const closed = h.closed.find((c) => c.airport.id === id);
  if (closed) return day < closed.until ? id : airportOnDate(h, closed.movedTo, date);
  const opened = h.opened[id];
  if (opened && day < opened[0]) return opened[1];
  const r = h.replaced.find((x) => x.id === id);
  if (r?.reopens && day >= r.until && day < r.reopens) return null;
  return id;
}

// ─── Modelled carriers ─────────────────────────────────────────────────────────

export type ModelledKind = 'N' | 'C' | 'L';

/**
 * Low-cost airlines as a business model, by region (Wikipedia: low-cost carrier): after US deregulation (Southwest went
 * interstate in 1979), Europe from the mid-1990s (Ryanair 1991, easyJet 1995), Asia, Latin America and Australia around
 * 2000–2004. They then took a growing share of their markets over about 15 years.
 */
export const LOW_COST_FROM: Record<string, number> = { NA: 1979, EU: 1995, OC: 2000, SA: 2001, AS: 2002, AF: 2004 };
const LOW_COST_RAMP_YEARS = 15;

/** Holiday countries of the European package-tour charters (1960s–1990s). */
const HOLIDAY = new Set(['ES', 'PT', 'GR', 'IT', 'CY', 'MT', 'TR', 'HR', 'YU', 'BG', 'TN', 'MA', 'EG', 'CV', 'GM']);
/** Planned economies until 1990: one state airline, no charter or low-cost airlines of their own. */
const EAST_BLOC = new Set(['SU', 'PL', 'CS', 'HU', 'RO', 'BG', 'DD', 'AL', 'CN', 'VN', 'KP', 'CU', 'MN']);
const planned = (state: string, year: number) => EAST_BLOC.has(state) && year < (state === 'SU' ? 1992 : 1990);
/** Airports too small for a route without official numbers in a weak year: needed share of today's demand by size. */
const MIN_GROWTH: Record<string, number> = { 'large|large': 0.05, 'large|medium': 0.12, 'medium|medium': 0.15 };

const hash01 = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

export interface ModelledInput {
  real: RealAirlines;
  /** The date the network is modelled for (rebuilt every year, so the network grows with the economy). */
  date: Date;
  /** The airports of the current date and how today's airports map onto them. */
  airportById: ReadonlyMap<string, Airport>;
  mapAirport: (id: string) => string | null;
  continentOf: (country: string) => string | undefined;
}

/**
 * The established airlines of a historical start year, modelled from today's network: every country's network
 * carriers (and regional airlines) become its national carrier, charter airlines its charter carrier, low-cost
 * airlines a low-cost carrier where that model existed (otherwise charter flights in Europe, the national carrier
 * elsewhere). Today's former states (Soviet Union, Yugoslavia, Czechoslovakia, East Germany) get one carrier each.
 * Routes too thin for that year's economy are left out; frequencies follow each year's demand at run time. The game
 * rebuilds this every year, so new routes and new low-cost carriers appear as they did in reality.
 */
export function buildModelledAirlines(input: ModelledInput): RealAirlines {
  const { real, date: start, airportById, mapAirport, continentOf } = input;
  const startYear = start.getUTCFullYear();
  const year = fractionalYearOf(start);
  const homeOf = (a: RealAirline) => a.country ?? airportById.get(a.hubs[0] ?? '')?.country;
  // States whose flag carrier no longer exists (Czech Airlines, Malév …): their biggest airlines of today stand in.
  const withNational = new Set<string>();
  for (const a of real.byId.values()) {
    const home = homeOf(a);
    if (home && (a.model === 'legacy' || a.model === 'regional') && real.routesOf(a.id).length) withNational.add(stateOf(home, a.hubs[0] ?? '', start));
  }
  const kindOf = (a: RealAirline): ModelledKind => {
    if (a.model === 'legacy' || a.model === 'regional') return 'N';
    const home = homeOf(a);
    const homeState = home ? stateOf(home, a.hubs[0] ?? '', start) : '';
    if (home && !withNational.has(homeState)) return 'N';
    if (planned(homeState, startYear)) return a.model === 'lowcost' ? 'C' : 'N';
    if (a.model === 'charter') return 'C';
    const from = LOW_COST_FROM[continentOf(a.country ?? '') ?? ''] ?? 2004;
    const share = Math.min(1, Math.max(0, (startYear - from) / LOW_COST_RAMP_YEARS));
    if (hash01(a.id) < share) return 'L';
    return continentOf(a.country ?? '') === 'EU' ? 'C' : 'N';
  };

  type Merged = RealRoute & { count: number };
  const carriers = new Map<string, { id: string; state: string; kind: ModelledKind; hubs: Map<string, number>; routes: Map<string, Merged> }>();
  for (const airline of real.byId.values()) {
    const routes = real.routesOf(airline.id);
    if (!routes.length) continue;
    const kind = kindOf(airline);
    const homeCountry = homeOf(airline);
    if (!homeCountry) continue;
    for (const r of routes) {
      const a = mapAirport(r.a);
      const b = mapAirport(r.b);
      if (!a || !b || a === b) continue;
      const A = airportById.get(a);
      const B = airportById.get(b);
      if (!A || !B) continue;
      // East German airports belonged to the GDR's carrier, whoever flies there today.
      const eastEnd = homeCountry === 'DE' && [a, b].find((x) => EAST_GERMAN_AIRPORTS.has(x));
      let state = eastEnd ? stateOf('DE', eastEnd, start) : stateOf(homeCountry, airline.hubs[0] ?? '', start);
      // A low-cost route before low-cost airlines: only holiday flights existed, flown by a charter airline of the
      // country the holidaymakers came from (Ryanair's or Wizz Air's other routes didn't exist).
      if (kind === 'C' && airline.model === 'lowcost') {
        const holidayA = HOLIDAY.has(A.country);
        const holidayB = HOLIDAY.has(B.country);
        if (holidayA === holidayB) continue;
        const from = holidayA ? B : A;
        state = stateOf(from.country, from.id, start);
        if (planned(state, startYear)) continue;
      }
      // Routes the economy of the time couldn't fill (< 2 flights a week each way at today's frequencies; without
      // official numbers: thin routes between smaller airports).
      const g = Math.sqrt(demandIndex(A.country, year) * demandIndex(B.country, year));
      const weekly = Math.max(r.weeklyAB ?? 0, r.weeklyBA ?? 0);
      if (weekly > 0 && weekly * g < 2) continue;
      const sizes = [A.size, B.size].sort().join('|');
      if (weekly === 0 && g < (MIN_GROWTH[sizes] ?? 0.3)) continue;
      const id = `~${state}${kind}`;
      const c = carriers.get(id) ?? { id, state, kind, hubs: new Map(), routes: new Map() };
      carriers.set(id, c);
      if (kind === 'N' || kind === 'L') for (const h of [...airline.hubs, ...airline.bases].map(mapAirport)) if (h && (h === a || h === b)) c.hubs.set(h, (c.hubs.get(h) ?? 0) + 1);
      const [x, y, ab, ba] = a < b ? [a, b, r.weeklyAB, r.weeklyBA] : [b, a, r.weeklyBA, r.weeklyAB];
      const key = `${x}|${y}`;
      const m = c.routes.get(key);
      const add = (p: number | null, q: number | null) => (p === null ? q : q === null ? p : p + q);
      if (!m) c.routes.set(key, { airline: id, a: x, b: y, seasonal: r.seasonal, charter: r.charter || kind === 'C', weeklyAB: ab, weeklyBA: ba, count: 1 });
      else {
        m.weeklyAB = add(m.weeklyAB, ab);
        m.weeklyBA = add(m.weeklyBA, ba);
        m.seasonal &&= r.seasonal;
        m.count++;
      }
    }
  }

  const MODEL: Record<ModelledKind, BusinessModel> = { N: 'legacy', C: 'charter', L: 'lowcost' };
  const airlines: RealAirline[] = [];
  const routesBy = new Map<string, RealRoute[]>();
  for (const c of carriers.values()) {
    const routes = [...c.routes.values()].map(({ count: _count, ...r }) => r);
    if (!routes.length) continue;
    // Hubs: the airports most of the merged airlines used as hubs; else the busiest airport of the network.
    const ranked = [...c.hubs.entries()].sort((p, q) => q[1] - p[1]).map(([h]) => h);
    if (!ranked.length) {
      const count = new Map<string, number>();
      for (const r of routes) for (const x of [r.a, r.b]) if (airportById.get(x)?.country && stateOf(airportById.get(x)!.country, x, start) === c.state) count.set(x, (count.get(x) ?? 0) + 1);
      const top = [...count.entries()].sort((p, q) => q[1] - p[1])[0];
      if (top) ranked.push(top[0]);
    }
    const [primary, secondary] = generatedColors(c.id);
    airlines.push({
      id: c.id,
      name: c.id,
      iata: null,
      icao: null,
      country: c.state === 'DW' ? 'DE' : ['SU', 'YU', 'CS', 'DD'].includes(c.state) ? null : c.state,
      model: MODEL[c.kind],
      hubs: ranked.slice(0, c.kind === 'N' ? 2 : 1),
      bases: ranked.slice(c.kind === 'N' ? 2 : 1, 8),
      alliance: null,
      parent: null,
      brand: false,
      wikipedia: null,
      fleet: [],
      registered: [],
      colors: { primary, secondary, source: 'generated' },
      modelled: { state: c.state, kind: c.kind },
    });
    routesBy.set(c.id, routes);
  }
  return fromParts(real.season, airlines, routesBy, real.observedWeeklyPax);
}

/** Builds the lookup object the engine uses from a list of airlines and their routes. */
export function fromParts(
  season: string,
  airlines: RealAirline[],
  routesBy: Map<string, RealRoute[]>,
  observedWeeklyPax: RealAirlines['observedWeeklyPax'],
  observedSeatsPerFlight: RealAirlines['observedSeatsPerFlight'] = () => null,
  measured: ReadonlySet<string> = new Set(),
): RealAirlines {
  const byId = new Map(airlines.map((a) => [a.id, a]));
  const byPair = new Map<string, RealRoute[]>();
  const byAirport = new Map<string, RealRoute[]>();
  for (const routes of routesBy.values()) {
    for (const r of routes) {
      const key = `${r.a}|${r.b}`;
      byPair.set(key, [...(byPair.get(key) ?? []), r]);
      for (const ap of [r.a, r.b]) {
        const list = byAirport.get(ap);
        if (list) list.push(r);
        else byAirport.set(ap, [r]);
      }
    }
  }
  return {
    season,
    byId,
    routesOf: (id) => routesBy.get(id) ?? [],
    observedWeeklyPax,
    observedSeatsPerFlight,
    measuredAt: (airport) => measured.has(airport),
    routesAt: (airport) => byAirport.get(airport) ?? [],
    on(from, to) {
      const [a, b] = from < to ? [from, to] : [to, from];
      return (byPair.get(`${a}|${b}`) ?? []).flatMap((r) => {
        const airline = byId.get(r.airline);
        return airline ? [{ airline, weekly: from === r.a ? r.weeklyAB : r.weeklyBA, seasonal: r.seasonal, charter: r.charter }] : [];
      });
    },
  };
}

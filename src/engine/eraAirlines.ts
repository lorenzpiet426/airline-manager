// The real airlines of a past year (Phase 6.3): today's airlines that already existed, plus the airlines that have closed
// since (Pan Am, Swissair, Sabena, Interflug …), each between its real founding and closing day. Their fleets are the
// types they really flew that year (Wikipedia's historical fleet tables); their routes are modelled:
//  - today's airlines fly today's network, thinned to what that year's economy could fill and, for young airlines,
//    to the size they had grown to (low-cost airlines grew fast and late);
//  - closed airlines fly from their real hubs to the destinations the demand model ranks best for that year, as many
//    as their fleet could serve.
// States without any real airline in the data (e.g. Greece before Aegean) keep a modelled national carrier (Phase 5.3).
import { getAircraftType, isInService, isFreighter, type AircraftType } from '../data/aircraft';
import { demandIndex } from '../data/economyHistory';
import { fractionalYearOf, GERMAN_REUNIFICATION, stateOf } from '../data/eras';
import { DEFUNCT_COLORS, generatedColors } from '../data/airlineColors';
import type { Airport } from '../data/types';
import { buildModelledAirlines, fromParts, type ModelledInput } from './era';
import { distanceKm } from './geo';
import type { BusinessModel, FleetLine, RealAirline, RealAirlines, RealRoute } from './realAirlines';

/** A closed airline (Wikidata, CC0). */
export interface DefunctAirline {
  id: string;
  name: string;
  iata: string | null;
  icao: string | null;
  country: string | null;
  model: BusinessModel;
  hubs: string[];
  bases: string[];
  alliance: string | null;
  parent: string | null;
  /** Founding and closing day, YYYY-MM-DD. */
  founded: string | null;
  ceased: string;
  successor: string | null;
  /** The successor's id in the game, when it is an airline in the data. */
  successorId: string | null;
  wikipedia: string | null;
  /** Wikipedia language versions (how well known the airline is). */
  fame: number;
}

/** [type, first year, last year (null = still flying), aircraft over the years (or null)]. */
export type FleetSpan = [string, number | null, number | null, number | null];

export interface AirlineHistory {
  defunct: DefunctAirline[];
  /** Founding days of today's airlines (YYYY-MM-DD) where Wikidata knows the day. */
  founded: Record<string, string>;
  fleets: Record<string, FleetSpan[]>;
}

/** A founding or closing on a real date (shown in the news). */
export interface AirlineChange {
  day: string;
  kind: 'founded' | 'ceased';
  id: string;
  name: string;
  successor: string | null;
  fame: number;
  /** Home country (news for players based there). */
  country: string | null;
}

/** Year in which a young airline's network has grown to today's size (others fly today's network from the start). */
const GROWN_AFTER_YEARS = 30;
/** Low-cost airlines grew exponentially: the network shrinks by e every this many years back from 2024. */
const LOW_COST_GROWTH_YEARS = 6;
const REFERENCE_YEAR = 2024;
/** Founding year assumed for today's airlines without one in Wikidata (at the earliest). */
const UNKNOWN_FOUNDED_FROM = 1995;
/** Routes a closed airline flew per aircraft in its fleet (long-haul aircraft fly fewer, longer routes). */
const ROUTES_PER_AIRCRAFT = 0.8;
/** Fleet tables give the aircraft of a type over all the years: about this share flew at the same time. */
const AT_ONCE = 0.7;
/** Routes of a closed airline without fleet numbers, per Wikipedia language version. */
const ROUTES_PER_FAME = 0.6;
const MAX_ROUTES = 150;
/** Routes of a closed airline without a fleet table: at most this many (they are mostly small airlines). */
const MAX_ROUTES_NO_FLEET = 25;
/** An airline flies a type at most this long when its fleet table gives no last year. */
const MAX_TYPE_YEARS = 30;
/** Today's network carriers were smaller when their home country's air travel was: network × demand index^this. */
const NETWORK_DEMAND_EXP = 0.5;
/** Holiday countries (charter airlines of the time flew there). */
const HOLIDAY = new Set(['ES', 'PT', 'GR', 'IT', 'CY', 'MT', 'TR', 'HR', 'YU', 'BG', 'TN', 'MA', 'EG', 'CV', 'GM', 'DO', 'MX', 'JM', 'CU', 'TH', 'KE']);
/** Airports too small for a route without official numbers in a weak year: needed share of today's demand by size. */
const MIN_GROWTH: Record<string, number> = { 'large|large': 0.05, 'large|medium': 0.12, 'medium|medium': 0.15 };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** West Berlin (Tegel = the game's EDDB before BER opened, Tempelhof): until reunification only American, British and
 * French airlines could fly there. */
const WEST_BERLIN = new Set(['EDDB', 'DE-0456']);
const ALLIED = new Set(['US', 'GB', 'FR']);
const FORMER = new Set(['SU', 'YU', 'CS', 'DD', 'DW']);
const berlinClosed = (date: Date, country: string | null | undefined, a: string, b: string) =>
  iso(date) < GERMAN_REUNIFICATION && (WEST_BERLIN.has(a) || WEST_BERLIN.has(b)) && !ALLIED.has(country ?? '');

const yearOf = (day: string | null | undefined) => (day ? Number(day.slice(0, 4)) : null);

function safeType(id: string): AircraftType | null {
  try {
    return getAircraftType(id);
  } catch {
    return null;
  }
}

/** The types an airline flew in `year` (from its fleet table spans; today's fleet for types it still flies). */
export function eraFleet(
  spans: readonly FleetSpan[] | undefined,
  current: readonly FleetLine[],
  year: number,
  foundedYear: number | null,
  ceasedYear: number | null = null,
): FleetLine[] {
  const lines = new Map<string, FleetLine>();
  for (const [typeId, from, to, count] of spans ?? []) {
    const type = safeType(typeId);
    if (!type || isFreighter(type) || !isInService(type, year)) continue;
    const start = from ?? Math.max(type.eis, foundedYear ?? type.eis);
    // Without a last year: at most MAX_TYPE_YEARS (and not after the airline closed).
    const end = to ?? (from !== null ? Math.min(from + MAX_TYPE_YEARS, ceasedYear ?? Infinity) : null);
    if (year < start || (end !== null && year > end)) continue;
    const e = lines.get(typeId) ?? { type: typeId, inService: 0, orders: 0, seats: null };
    e.inService += Math.max(1, Math.round((count ?? 3) * AT_ONCE));
    lines.set(typeId, e);
  }
  // Types still in today's fleet without a historical row: flown since the type (or the airline) began.
  for (const f of current) {
    const type = safeType(f.type);
    if (!type || lines.has(f.type) || f.inService <= 0 || !isInService(type, year) || year < Math.max(type.eis, foundedYear ?? 0)) continue;
    if ((spans ?? []).some((s) => s[0] === f.type)) continue;
    lines.set(f.type, { ...f, orders: 0 });
  }
  return [...lines.values()];
}

/** Share of today's network a young airline already flew in `year`. */
export function networkShare(model: BusinessModel, foundedYear: number | null, year: number): number {
  if (year >= REFERENCE_YEAR) return 1;
  if (model === 'lowcost') return Math.min(1, Math.exp(-(REFERENCE_YEAR - year) / LOW_COST_GROWTH_YEARS));
  if (foundedYear === null || foundedYear < 1960) return 1;
  return Math.min(1, ((year - foundedYear + 1) / GROWN_AFTER_YEARS) ** 1.2);
}

export interface EraInput extends ModelledInput {
  history: AirlineHistory;
  /** Founding year and fame (Wikipedia language versions) of today's airlines, from airlines.json. */
  facts: (id: string) => { founded: number | null; fame: number } | undefined;
  /** The demand model's yearly passengers between two airports (for ranking a closed airline's destinations). */
  gravity: (a: Airport, b: Airport) => number;
  /** Today's airport that took over a closed one's flights (Schönefeld → BER), for looking up destinations. */
  todayOf: (id: string) => string;
}

/** All airlines active at some point of `year`, with their networks and fleets of that year (mid-year). */
export interface EraYear {
  airlines: RealAirline[];
  routes: Map<string, RealRoute[]>;
  /** Founding/closing day per airline (absent = before or after this year). */
  span: Map<string, [string | null, string | null]>;
  /** Every day of the year on which an airline starts or stops flying, sorted. */
  days: string[];
  changes: AirlineChange[];
}

export function buildEraYear(input: EraInput): EraYear {
  const { real, history, date, airportById, mapAirport } = input;
  const year = date.getUTCFullYear();
  const fy = fractionalYearOf(date);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const airlines: RealAirline[] = [];
  const routes = new Map<string, RealRoute[]>();
  const span = new Map<string, [string | null, string | null]>();
  const changes: AirlineChange[] = [];
  const growth = (A: Airport, B: Airport) => Math.sqrt(demandIndex(A.country, fy) * demandIndex(B.country, fy));
  /** Can the economy of the year fill the route? (same rule as the modelled carriers) */
  const fillable = (A: Airport, B: Airport, weekly: number) => {
    const g = growth(A, B);
    if (weekly > 0) return weekly * g >= 2;
    return g >= (MIN_GROWTH[[A.size, B.size].sort().join('|')] ?? 0.3);
  };

  // ── Today's airlines that already existed ──
  for (const airline of real.byId.values()) {
    const facts = input.facts(airline.id);
    const knownDay = history.founded[airline.id] ?? (facts?.founded ? `${facts.founded}-01-01` : null);
    // No founding year in Wikidata: mostly young airlines (their items are new). Assumed founded when the types they
    // fly today entered service, not before UNKNOWN_FOUNDED_FROM; not in the news.
    const foundedDay = knownDay ?? `${Math.max(UNKNOWN_FOUNDED_FROM, ...airline.fleet.map((f) => safeType(f.type)?.eis ?? 0))}-01-01`;
    if (foundedDay && foundedDay > yearEnd) continue;
    const foundedYear = yearOf(foundedDay);
    const homeCountry = airline.country ?? airportById.get(mapAirport(airline.hubs[0] ?? '') ?? '')?.country;
    const homeDemand = homeCountry ? Math.min(1, demandIndex(homeCountry, fy)) : 1;
    const share = networkShare(airline.model, foundedYear, year) * homeDemand ** NETWORK_DEMAND_EXP;
    const hubs = new Set([...airline.hubs, ...airline.bases].map(mapAirport).filter((x): x is string => !!x));
    const kept: (RealRoute & { score: number })[] = [];
    for (const r of real.routesOf(airline.id)) {
      const a = mapAirport(r.a);
      const b = mapAirport(r.b);
      if (!a || !b || a === b) continue;
      const A = airportById.get(a);
      const B = airportById.get(b);
      if (!A || !B) continue;
      const weekly = Math.max(r.weeklyAB ?? 0, r.weeklyBA ?? 0);
      if (!fillable(A, B, weekly) || berlinClosed(date, airline.country, a, b)) continue;
      const [x, y, ab, ba] = a < b ? [a, b, r.weeklyAB, r.weeklyBA] : [b, a, r.weeklyBA, r.weeklyAB];
      const score = (hubs.has(a) || hubs.has(b) ? 1e9 : 0) + (weekly || 1) * 1e6 + input.gravity(A, B) / 1e3;
      kept.push({ ...r, a: x, b: y, weeklyAB: ab, weeklyBA: ba, score });
    }
    if (!kept.length) continue;
    const n = Math.max(1, Math.round(kept.length * share));
    const chosen = kept.sort((p, q) => q.score - p.score).slice(0, n);
    // Merge routes that map onto the same airports (e.g. today's BER and its predecessor). Today's measured frequencies
    // don't apply to the past: the game splits the demand of the time between the airlines of the time.
    const merged = new Map<string, RealRoute>();
    for (const { score: _s, ...r } of chosen) if (!merged.has(`${r.a}|${r.b}`)) merged.set(`${r.a}|${r.b}`, { ...r, weeklyAB: null, weeklyBA: null });
    const fleet = eraFleet(history.fleets[airline.id], airline.fleet, year, foundedYear);
    airlines.push({
      ...airline,
      // Today's airports mapped onto those of the year (Incheon → Gimpo before 2001): each once.
      hubs: [...new Set(airline.hubs.map(mapAirport).filter((x): x is string => !!x))],
      bases: [...new Set(airline.bases.map(mapAirport).filter((x): x is string => !!x))].filter((x) => !airline.hubs.map(mapAirport).includes(x)),
      fleet,
      registered: [],
      era: { founded: foundedDay, ceased: null, successor: null, fleet: history.fleets[airline.id] ? 'wikipedia' : 'today' },
    });
    routes.set(airline.id, [...merged.values()]);
    span.set(airline.id, [foundedDay && foundedDay >= yearStart ? foundedDay : null, null]);
    if (knownDay && foundedDay >= yearStart && foundedDay <= yearEnd) {
      changes.push({ day: foundedDay, kind: 'founded', id: airline.id, name: airline.name, successor: null, fame: facts?.fame ?? 0, country: homeCountry ?? null });
    }
  }

  // ── Closed airlines that were still flying ──
  const seenCodes = new Set(airlines.map((a) => a.id));
  for (const d of history.defunct) {
    if ((d.founded && d.founded > yearEnd) || d.ceased < yearStart || seenCodes.has(d.id)) continue;
    const hubs = [...new Set(d.hubs.map(mapAirport).filter((x): x is string => !!x && airportById.has(x)))];
    const bases = [...new Set(d.bases.map(mapAirport).filter((x): x is string => !!x && airportById.has(x) && !hubs.includes(x)))];
    if (!hubs.length && !bases.length) continue;
    const foundedYear = yearOf(d.founded);
    const fleet = eraFleet(history.fleets[d.id], [], year, foundedYear, yearOf(d.ceased));
    const aircraft = fleet.reduce((s, f) => s + f.inService, 0);
    // Routes from the fleet (tables without numbers: at least what the airline's fame suggests).
    const byFame = Math.min(MAX_ROUTES_NO_FLEET, Math.max(2, Math.round(d.fame * ROUTES_PER_FAME)));
    const wanted = aircraft ? Math.min(MAX_ROUTES, Math.max(byFame, Math.round(aircraft * ROUTES_PER_AIRCRAFT))) : byFame;
    const home = d.country ?? airportById.get(hubs[0] ?? bases[0] ?? '')?.country;
    // Compared as states of the time (West/East Germany, Soviet Union …); former states are already one.
    const homeState = home && !FORMER.has(home) ? stateOf(home, hubs[0] ?? bases[0] ?? '', date) : home;
    // The longest distance the fleet can fly (no fleet table: typical short/medium-haul unless well known).
    const types = fleet.map((f) => safeType(f.type)).filter((t): t is AircraftType => !!t);
    const reach = types.length ? Math.max(...types.map((t) => t.rangeKm)) / 1.05 : d.fame >= 25 ? 12_000 : 4_000;
    const list: (RealRoute & { score: number })[] = [];
    const seen = new Set<string>();
    for (const [i, h] of [...hubs, ...bases].entries()) {
      const H = airportById.get(h)!;
      const isHub = i < hubs.length;
      // Where flights from this airport go today (any airline): the places worth flying to.
      const now = input.todayOf(h);
      for (const r of real.routesAt(now)) {
        const other = mapAirport(r.a === now ? r.b : r.a);
        if (!other || other === h) continue;
        const O = airportById.get(other);
        if (!O) continue;
        const key = h < other ? `${h}|${other}` : `${other}|${h}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const km = distanceKm(H, O);
        if (km < 150 || km > reach || berlinClosed(date, d.country, h, other)) continue;
        // From a hub abroad (Pan Am at Tokyo, TWA at Paris) only flights back home: foreign airlines may not fly
        // domestic routes there (cabotage), and onward flights to third countries needed rights they rarely had.
        if (homeState && stateOf(H.country, h, date) !== homeState && stateOf(O.country, other, date) !== homeState) continue;
        if (d.model === 'charter' && !HOLIDAY.has(O.country)) continue;
        if (d.model === 'regional' && km > 2500) continue;
        if (!fillable(H, O, 0)) continue;
        const score = input.gravity(H, O) * growth(H, O) * (isHub ? 1 : 0.5);
        const [a, b] = h < other ? [h, other] : [other, h];
        list.push({ airline: d.id, a, b, seasonal: d.model === 'charter', charter: d.model === 'charter', weeklyAB: null, weeklyBA: null, score });
      }
    }
    if (!list.length) continue;
    const chosen = list.sort((p, q) => q.score - p.score).slice(0, wanted).map(({ score: _s, ...r }) => r);
    const known = DEFUNCT_COLORS[d.id];
    const [primary, secondary] = known ?? generatedColors(d.id);
    airlines.push({
      id: d.id,
      name: d.name,
      iata: d.iata,
      icao: d.icao,
      country: d.country,
      model: d.model,
      hubs,
      bases,
      alliance: d.alliance,
      parent: d.parent,
      brand: false,
      wikipedia: d.wikipedia,
      fleet,
      registered: [],
      colors: { primary, secondary, source: known ? 'known' : 'generated' },
      era: { founded: d.founded, ceased: d.ceased, successor: d.successor, fleet: history.fleets[d.id] ? 'wikipedia' : 'typical' },
    });
    routes.set(d.id, chosen);
    span.set(d.id, [d.founded && d.founded >= yearStart ? d.founded : null, d.ceased <= yearEnd ? d.ceased : null]);
    const country = home ?? null;
    if (d.founded && d.founded >= yearStart && d.founded <= yearEnd) changes.push({ day: d.founded, kind: 'founded', id: d.id, name: d.name, successor: null, fame: d.fame, country });
    if (d.ceased <= yearEnd) changes.push({ day: d.ceased, kind: 'ceased', id: d.id, name: d.name, successor: d.successor, fame: d.fame, country });
  }

  // ── States without a real airline: a modelled national carrier (Phase 5.3) ──
  const covered = new Set<string>();
  for (const a of airlines) {
    const hub = a.hubs[0] ?? a.bases[0];
    const country = a.country ?? airportById.get(hub ?? '')?.country;
    if (country && (routes.get(a.id)?.length ?? 0) > 0) covered.add(stateOf(country, hub ?? '', date));
  }
  const modelled = buildModelledAirlines(input);
  for (const m of modelled.byId.values()) {
    if (m.modelled?.kind !== 'N' || covered.has(m.modelled.state)) continue;
    airlines.push(m);
    routes.set(m.id, [...modelled.routesOf(m.id)]);
  }
  changes.sort((p, q) => p.day.localeCompare(q.day));
  const days = [...span.values()].flatMap(([from, until]) => [from, until]).filter((x): x is string => !!x).sort();
  return { airlines, routes, span, days, changes };
}

/** The airlines of `year` flying on `date`. */
export function eraAirlinesOn(y: EraYear, real: RealAirlines, date: Date): RealAirlines {
  const day = iso(date);
  const active = y.airlines.filter((a) => {
    const [from, until] = y.span.get(a.id) ?? [null, null];
    return (!from || from <= day) && (!until || day < until);
  });
  const routes = new Map(active.map((a) => [a.id, y.routes.get(a.id) ?? []]));
  const result = fromParts(real.season, active, routes, real.observedWeeklyPax, real.observedSeatsPerFlight);
  return { ...result, eraChanges: y.changes };
}

/** A key that changes whenever an airline of `year` starts or stops flying (worlds are cached by it). */
export function airlineEraKey(y: EraYear, date: Date): number {
  const day = iso(date);
  let n = 0;
  while (n < y.days.length && y.days[n]! <= day) n++;
  return n;
}

/** Airlines well enough known to make the world news when they start or stop flying (Wikipedia language versions). */
export const NEWSWORTHY_FAME = 15;

/** The founding and closing days of today (historical games), for the news: famous airlines and those of the countries
 * the player's hubs are in. */
export function airlineChangesToday(changes: readonly AirlineChange[] | undefined, day: string, playerCountries: ReadonlySet<string>): AirlineChange[] {
  return (changes ?? []).filter((c) => c.day === day && (c.fame >= NEWSWORTHY_FAME || (c.country !== null && playerCountries.has(c.country))));
}

// The real airlines of the world (Phase 2.1a): read-only data built from Wikipedia, Wikidata, Eurostat and official
// registers (see src/data/generated/README.md). In 2.1a they fly their networks as they are; reacting to the player
// (new routes, price wars, fleet changes) comes in 2.1b.
import { AIRLINE_COLORS, generatedColors } from '../data/airlineColors';
import { fromParts } from './era';
import type { AirlineChange, AirlineHistory } from './eraAirlines';

export type BusinessModel = 'legacy' | 'lowcost' | 'regional' | 'charter';
/** Where a number comes from (shown in the game). */
export type SourceTag = 'official' | 'wikipedia' | 'hand-checked' | 'modelled';

export interface FleetLine {
  type: string;
  inService: number;
  orders: number;
  seats: number | null;
}

export interface RealAirline {
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
  brand: boolean;
  wikipedia: string | null;
  fleet: FleetLine[];
  /** Individual aircraft from official registers: [registration, type, build year]. */
  registered: [string, string, number | null][];
  colors: { primary: string; secondary: string; source: 'known' | 'generated' };
  /** A modelled carrier of a historical start year (Phase 5.3): the state it belongs to and its kind
   * (N = national carrier, C = charter airline, L = low-cost airline). Its name is made by the screens. */
  modelled?: { state: string; kind: 'N' | 'C' | 'L' };
  /** An airline of a past year (Phase 6.3): founding and closing day (YYYY-MM-DD), successor, and where the fleet of
   * that year comes from (Wikipedia's fleet tables, today's fleet, or typical types of the time). */
  era?: { founded: string | null; ceased: string | null; successor: string | null; fleet: 'wikipedia' | 'today' | 'typical' };
}

export interface RealRoute {
  airline: string;
  a: string;
  b: string;
  seasonal: boolean;
  charter: boolean;
  /** Weekly flights a→b and b→a; null = no official number (the demand model fills it in). */
  weeklyAB: number | null;
  weeklyBA: number | null;
}

export interface RealAirlines {
  /** Season of the official frequencies, e.g. "S24". */
  season: string;
  byId: ReadonlyMap<string, RealAirline>;
  routesOf(airlineId: string): readonly RealRoute[];
  /** The real airlines flying from `from` to `to`, with their weekly flights in that direction (null = unknown). */
  on(from: string, to: string): { airline: RealAirline; weekly: number | null; seasonal: boolean; charter: boolean }[];
  /** Passengers per week measured on this route in this direction (Eurostat, summer season), or null. */
  observedWeeklyPax(from: string, to: string): number | null;
  /** True when Eurostat measured this airport's routes (so a route missing there didn't fly in the measured season). */
  measuredAt(airport: string): boolean;
  /** Average seats per flight measured on this route in this direction (all airlines, Eurostat), or null. */
  observedSeatsPerFlight(from: string, to: string): number | null;
  /** All real-world routes touching an airport (any airline). */
  routesAt(airport: string): readonly RealRoute[];
  /** Phase 6.3: closed airlines, founding days and historical fleets (today's data only). */
  history?: AirlineHistory;
  /** Phase 6.3: the airlines founded or closed in the year of a historical world (for the news). */
  eraChanges?: AirlineChange[];
  /** Founding year and fame (Wikipedia language versions) per airline (Wikidata), today's data only. */
  facts?: (id: string) => { founded: number | null; fame: number } | undefined;
}

/** Aircraft in service according to the fleet table. */
export const fleetSize = (a: RealAirline) => a.fleet.reduce((s, f) => s + f.inService, 0);

interface AirlinesJson { airlines: { id: string; name: string; iata: string | null; icao: string | null; country: string | null; alliance: string | null; parent: string | null; brand?: boolean; wikipedia: string | null; founded?: number | null; fame?: number }[] }
interface NetworksJson { season: string; airlines: { id: string; hubs: string[]; bases: string[]; routes: Omit<RealRoute, 'airline'>[] }[] }
interface DetailsJson { airlines: { id: string; model: BusinessModel; fleet: FleetLine[] }[] }
interface RegistersJson { aircraft: Record<string, [string, string, number | null][]> }
interface EurostatJson { routes: { from: string; to: string; weeklyPax: number; weeklySeats?: number; weeklyFlights?: number }[] }

export function buildRealAirlines(
  airlines: AirlinesJson,
  networks: NetworksJson,
  details: DetailsJson,
  registers: RegistersJson,
  eurostat?: EurostatJson,
  history?: AirlineHistory,
): RealAirlines {
  const observed = new Map((eurostat?.routes ?? []).filter((r) => r.weeklyPax > 0).map((r) => [`${r.from}>${r.to}`, r.weeklyPax]));
  const seatsPerFlight = new Map(
    (eurostat?.routes ?? []).filter((r) => (r.weeklyFlights ?? 0) > 0 && (r.weeklySeats ?? 0) > 0).map((r) => [`${r.from}>${r.to}`, r.weeklySeats! / r.weeklyFlights!]),
  );
  const detail = new Map(details.airlines.map((d) => [d.id, d]));
  const byId = new Map<string, RealAirline>();
  const routesBy = new Map<string, RealRoute[]>();
  const info = new Map(airlines.airlines.map((a) => [a.id, a]));
  for (const net of networks.airlines) {
    const a = info.get(net.id);
    if (!a) continue;
    const known = AIRLINE_COLORS[net.id];
    const [primary, secondary] = known ?? generatedColors(net.id);
    byId.set(net.id, {
      id: net.id,
      name: a.name,
      iata: a.iata,
      icao: a.icao,
      country: a.country,
      model: detail.get(net.id)?.model ?? 'legacy',
      hubs: net.hubs,
      bases: net.bases,
      alliance: a.alliance,
      parent: a.parent,
      brand: !!a.brand,
      wikipedia: a.wikipedia,
      fleet: detail.get(net.id)?.fleet ?? [],
      registered: registers.aircraft[net.id] ?? [],
      colors: { primary, secondary, source: known ? 'known' : 'generated' },
    });
    routesBy.set(net.id, net.routes.map((r) => ({ ...r, airline: net.id })));
  }
  const base = fromParts(networks.season, [...byId.values()], routesBy, (from, to) => observed.get(`${from}>${to}`) ?? null, (from, to) => seatsPerFlight.get(`${from}>${to}`) ?? null, new Set((eurostat?.routes ?? []).map((r) => r.from)));
  return {
    ...base,
    ...(history ? { history } : {}),
    facts: (id) => {
      const a = info.get(id);
      return a ? { founded: a.founded ?? null, fame: a.fame ?? 0 } : undefined;
    },
  };
}

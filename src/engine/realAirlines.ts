// The real airlines of the world (Phase 2.1a): read-only data built from Wikipedia, Wikidata, Eurostat and official
// registers (see src/data/generated/README.md). In 2.1a they fly their networks as they are; reacting to the player
// (new routes, price wars, fleet changes) comes in 2.1b.
import { AIRLINE_COLORS, generatedColors } from '../data/airlineColors';
import { fromParts } from './era';

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
  /** All real-world routes touching an airport (any airline). */
  routesAt(airport: string): readonly RealRoute[];
}

/** Aircraft in service according to the fleet table. */
export const fleetSize = (a: RealAirline) => a.fleet.reduce((s, f) => s + f.inService, 0);

interface AirlinesJson { airlines: { id: string; name: string; iata: string | null; icao: string | null; country: string | null; alliance: string | null; parent: string | null; brand?: boolean; wikipedia: string | null }[] }
interface NetworksJson { season: string; airlines: { id: string; hubs: string[]; bases: string[]; routes: Omit<RealRoute, 'airline'>[] }[] }
interface DetailsJson { airlines: { id: string; model: BusinessModel; fleet: FleetLine[] }[] }
interface RegistersJson { aircraft: Record<string, [string, string, number | null][]> }
interface EurostatJson { routes: { from: string; to: string; weeklyPax: number }[] }

export function buildRealAirlines(
  airlines: AirlinesJson,
  networks: NetworksJson,
  details: DetailsJson,
  registers: RegistersJson,
  eurostat?: EurostatJson,
): RealAirlines {
  const observed = new Map((eurostat?.routes ?? []).filter((r) => r.weeklyPax > 0).map((r) => [`${r.from}>${r.to}`, r.weeklyPax]));
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
  return fromParts(networks.season, [...byId.values()], routesBy, (from, to) => observed.get(`${from}>${to}`) ?? null);
}

// The static world the engine works with (read-only): airports, countries and the airports that
// can serve as diversion airports for ETOPS checks.
import type { Airport, Country } from '../data/types';
import type { FxHistory } from '../data/fxHistory';
import { airportEraKey, airportOnDate, airportsAt, buildModelledAirlines, REAL_AIRLINES_FROM, type AirportHistory } from './era';
import type { RealAirlines } from './realAirlines';

export interface EngineWorld {
  airportById: ReadonlyMap<string, Airport>;
  countries: Readonly<Record<string, Country>>;
  /** Airports usable for a diversion: paved runway of 1,800 m or more, large or medium. */
  diversionAirports: readonly Airport[];
  /** Tourist arrivals per inhabitant (by country): touristy countries attract more travellers. */
  tourismIntensity: (country: string) => number;
  /** The real airlines and their networks (Phase 2.1a). Without them, competition is "invisible incumbents". */
  realAirlines?: RealAirlines;
  /** Monthly exchange rates since 1970 (Phase 5.3: games before today's data use the real rates of their month). */
  fxHistory?: FxHistory;
  /** Which airports existed when (Phase 5.3). */
  airportHistory?: AirportHistory;
}

/** Length of the longest paved (hard) runway in metres; jets can't use grass or gravel. */
export function longestHardRunwayM(airport: Airport): number {
  return airport.runways.reduce((max, r) => (r.surface !== 'soft' && r.lengthM > max ? r.lengthM : max), 0);
}

export function buildEngineWorld(
  airports: readonly Airport[],
  countries: Readonly<Record<string, Country>>,
  realAirlines?: RealAirlines,
  extra: Pick<EngineWorld, 'fxHistory' | 'airportHistory'> = {},
): EngineWorld {
  const people: Record<string, number> = {};
  for (const a of airports) people[a.country] = (people[a.country] ?? 0) + a.marketPop;
  return {
    airportById: new Map(airports.map((a) => [a.id, a])),
    countries,
    diversionAirports: airports.filter((a) => a.size !== 'small' && longestHardRunwayM(a) >= 1800),
    tourismIntensity: (country) => (countries[country]?.tourismArrivals ?? 0) / Math.max(100_000, people[country] ?? 0),
    ...(realAirlines ? { realAirlines } : {}),
    ...extra,
  };
}

/** Everything a world is made of: today's data and the history tables. */
export interface WorldSources {
  airports: readonly Airport[];
  countries: Readonly<Record<string, Country>>;
  realAirlines?: RealAirlines;
  fxHistory?: FxHistory;
  airportHistory?: AirportHistory;
}

/**
 * The world a game sees on a date (Phase 5.3). Games starting today use today's airports and real airlines; historical
 * games see the airports of the date and the modelled carriers of their start year. Worlds are cached: they only
 * change when an airport opens or closes.
 */
export function worldCache(src: WorldSources): (startYear: number | undefined, date: Date) => EngineWorld {
  const extra = { ...(src.fxHistory ? { fxHistory: src.fxHistory } : {}), ...(src.airportHistory ? { airportHistory: src.airportHistory } : {}) };
  const today = buildEngineWorld(src.airports, src.countries, src.realAirlines, extra);
  const cache = new Map<string, EngineWorld>();
  return (startYear, date) => {
    const h = src.airportHistory;
    if (!h || startYear === undefined || startYear >= REAL_AIRLINES_FROM) return today;
    const key = `${date.getUTCFullYear()}|${airportEraKey(h, date)}`;
    let world = cache.get(key);
    if (!world) {
      const airports = airportsAt(src.airports, h, date);
      const airportById = new Map(airports.map((a) => [a.id, a]));
      const real = src.realAirlines
        ? buildModelledAirlines({
            real: src.realAirlines,
            date: new Date(Date.UTC(date.getUTCFullYear(), 6, 1)),
            airportById,
            mapAirport: (id) => airportOnDate(h, id, date),
            continentOf: (c) => src.countries[c]?.continent,
          })
        : undefined;
      world = buildEngineWorld(airports, src.countries, real, extra);
      if (cache.size > 8) cache.clear();
      cache.set(key, world);
    }
    return world;
  };
}

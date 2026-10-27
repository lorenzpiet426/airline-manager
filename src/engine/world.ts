// The static world the engine works with (read-only): airports, countries and the airports that
// can serve as diversion airports for ETOPS checks.
import type { Airport, Country } from '../data/types';

export interface EngineWorld {
  airportById: ReadonlyMap<string, Airport>;
  countries: Readonly<Record<string, Country>>;
  /** Airports usable for a diversion: paved runway of 1,800 m or more, large or medium. */
  diversionAirports: readonly Airport[];
  /** Tourist arrivals per inhabitant (by country): touristy countries attract more travellers. */
  tourismIntensity: (country: string) => number;
}

/** Length of the longest paved (hard) runway in metres; jets can't use grass or gravel. */
export function longestHardRunwayM(airport: Airport): number {
  return airport.runways.reduce((max, r) => (r.surface !== 'soft' && r.lengthM > max ? r.lengthM : max), 0);
}

export function buildEngineWorld(airports: readonly Airport[], countries: Readonly<Record<string, Country>>): EngineWorld {
  const people: Record<string, number> = {};
  for (const a of airports) people[a.country] = (people[a.country] ?? 0) + a.marketPop;
  return {
    airportById: new Map(airports.map((a) => [a.id, a])),
    countries,
    diversionAirports: airports.filter((a) => a.size !== 'small' && longestHardRunwayM(a) >= 1800),
    tourismIntensity: (country) => (countries[country]?.tourismArrivals ?? 0) / Math.max(100_000, people[country] ?? 0),
  };
}

// How flying looked in earlier years (Phase 5.3): price levels, regulated fares, and the countries that existed then.
// Used by historical start years; for 2025 and later every factor here is neutral, so today's games are unchanged.
import { cpiOf } from './inflation';

/** The engine's prices are 2025 dollars (calibrated on today's airline costs and fares). */
export const PRICE_BASE_YEAR = 2025;

/** Calendar year as a fraction, e.g. 1985.5 = 1 July 1985. */
export const fractionalYearOf = (date: Date): number =>
  date.getUTCFullYear() + (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / (365.25 * 86_400_000);

/** Then-year dollars per 2025 dollar (US consumer prices, interpolated between yearly averages); 1 from 2025 on. */
export function priceLevel(year: number): number {
  if (year >= PRICE_BASE_YEAR) return 1;
  const y = Math.floor(year);
  const cpi = cpiOf(y) + (cpiOf(y + 1) - cpiOf(y)) * (year - y);
  return cpi / cpiOf(PRICE_BASE_YEAR);
}

/**
 * Air fares after inflation, relative to today: flying was a luxury in 1970 and has become cheaper almost every year.
 * Modelled from: IATA (2023) "real yields fell nearly 6× and real unit costs over 4× since 1970" (per tonne-km, incl.
 * freight and Europe's regulated era); US domestic real fares ≈ 40 % lower in 2015 than in 1979 (A4A, DOT data);
 * IATA (2016): real return fares 61 % lower than in 1995. ICAO's world passenger yield was roughly 7–8 US cents per
 * passenger-km in the mid-1970s and 8–9 cents in 2019 (money of each year), i.e. about 4× higher after inflation.
 */
const REAL_FARE: [number, number][] = [
  [1970, 4.4], [1975, 4.2], [1980, 3.6], [1985, 3.2], [1990, 2.9], [1995, 2.6], [2000, 2.1], [2005, 1.65],
  [2010, 1.3], [2015, 1.05], [2019, 1.0],
];

function interpolate(table: [number, number][], year: number): number {
  if (year <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [y1, v1] = table[i]!;
    if (year <= y1) {
      const [y0, v0] = table[i - 1]!;
      return v0 + ((v1 - v0) * (year - y0)) / (y1 - y0);
    }
  }
  return table.at(-1)![1];
}

/** Fares after inflation compared with today (1 from 2019 on). */
export const realFareLevel = (year: number): number => interpolate(REAL_FARE, year);

/**
 * Real unit costs fell less than fares (IATA: ≈ 4× vs ≈ 6×), and fuel and aircraft are calculated separately (old
 * types burn more and need more maintenance, their prices are in the money of their time). Crews, fees, handling,
 * sales and overheads therefore
 * follow the fare level to this power — calibrated so typical routes keep realistic margins in every decade.
 */
export const COST_FOLLOWS_FARES = 1.0;

/** Multipliers for an amount in 2025 dollars: fares and the airline's own operating costs (not fuel or aircraft). */
export function eraLevels(year: number): { prices: number; fares: number; costs: number } {
  const prices = priceLevel(year);
  const real = realFareLevel(year);
  return { prices, fares: prices * real, costs: prices * real ** COST_FOLLOWS_FARES };
}

// ─── Regulated fares ───────────────────────────────────────────────────────────

/**
 * Before deregulation, governments (and IATA tariff conferences on international routes) fixed fares: airlines could
 * only offer small discounts. Dates when fares became free (Wikipedia: Airline Deregulation Act; European single
 * aviation market; the countries' own domestic reforms). Elsewhere fares count as free from 1995 (open-skies era,
 * IATA tariffs no longer binding in practice) — a simplification, tagged modelled.
 */
const DOMESTIC_FREE: Readonly<Record<string, string>> = {
  US: '1978-10-24', GB: '1987-01-01', CA: '1988-01-01', AU: '1990-10-31', NZ: '1983-01-01', CL: '1979-01-01',
  JP: '2000-02-01', IN: '1994-03-01', BR: '2001-01-01', CN: '2004-01-01', KR: '1989-01-01', MX: '1991-01-01',
};
/** The European single aviation market (third package 1993; EEA 1994; Switzerland 2002; new members on joining). */
const EUROPE_FREE: Readonly<Record<string, string>> = {
  BE: '1993-01-01', DK: '1993-01-01', DE: '1993-01-01', GR: '1993-01-01', ES: '1993-01-01', FR: '1993-01-01',
  IE: '1993-01-01', IT: '1993-01-01', LU: '1993-01-01', NL: '1993-01-01', PT: '1993-01-01', GB: '1993-01-01',
  AT: '1994-01-01', FI: '1994-01-01', SE: '1994-01-01', NO: '1994-01-01', IS: '1994-01-01', CH: '2002-06-01',
  CZ: '2004-05-01', EE: '2004-05-01', CY: '2004-05-01', LV: '2004-05-01', LT: '2004-05-01', HU: '2004-05-01',
  MT: '2004-05-01', PL: '2004-05-01', SI: '2004-05-01', SK: '2004-05-01', BG: '2007-01-01', RO: '2007-01-01',
  HR: '2013-07-01',
};
const OTHER_FREE = '1995-01-01';

/** The day fares became free between two countries (YYYY-MM-DD). */
export function faresFreeFrom(a: string, b: string): string {
  if (a === b) return DOMESTIC_FREE[a] ?? OTHER_FREE;
  const ea = EUROPE_FREE[a];
  const eb = EUROPE_FREE[b];
  if (ea && eb) return ea > eb ? ea : eb;
  return OTHER_FREE;
}

/** How far a fare may differ from the regulated (IATA/government) fare before deregulation. */
export const REGULATED_FARE_RANGE = [0.9, 1.1] as const;

/** Allowed fare factors on a route on a date (null = free). */
export function regulatedRange(a: string, b: string, date: Date): readonly [number, number] | null {
  return date.toISOString().slice(0, 10) < faresFreeFrom(a, b) ? REGULATED_FARE_RANGE : null;
}

// ─── Countries that existed then ───────────────────────────────────────────────

/**
 * Today's countries that belonged to another state on a date: the Soviet Union (until 26 Dec 1991), Yugoslavia (until
 * Slovenia's and Croatia's independence 25 Jun 1991, Bosnia and North Macedonia 1992, Serbia and Montenegro 2006),
 * Czechoslovakia (until 1 Jan 1993). East Germany (until 3 Oct 1990) is decided by airport (EAST_GERMAN_AIRPORTS).
 */
const FORMER_STATES: { state: string; until: string; countries: string[] }[] = [
  { state: 'SU', until: '1991-12-26', countries: ['RU', 'UA', 'BY', 'MD', 'EE', 'LV', 'LT', 'GE', 'AM', 'AZ', 'KZ', 'UZ', 'TM', 'TJ', 'KG'] },
  { state: 'YU', until: '1991-06-25', countries: ['SI', 'HR'] },
  { state: 'YU', until: '1992-04-07', countries: ['BA', 'MK'] },
  { state: 'YU', until: '2006-06-03', countries: ['RS', 'ME', 'XK'] },
  { state: 'CS', until: '1993-01-01', countries: ['CZ', 'SK'] },
];
export const GERMAN_REUNIFICATION = '1990-10-03';
/** Airports in the former East Germany (incl. East Berlin's Schönefeld). */
export const EAST_GERMAN_AIRPORTS = new Set(['EDDP', 'EDDC', 'EDDE', 'EDAH', 'ETNL', 'EDBC', 'EDCD', 'DE-0440']);

/** The state an airport belonged to on a date (today's country code, or SU/YU/CS/DD, DW = West Germany). */
export function stateOf(country: string, airportId: string, date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  if (country === 'DE' && iso < GERMAN_REUNIFICATION) return EAST_GERMAN_AIRPORTS.has(airportId) ? 'DD' : 'DW';
  for (const f of FORMER_STATES) if (iso < f.until && f.countries.includes(country)) return f.state;
  return country;
}

/** Former states with their own names (today's countries are named by the browser's country names). */
export const FORMER_STATE_CODES = ['SU', 'YU', 'CS', 'DD', 'DW'] as const;

// US consumer prices (BLS CPI-U, annual averages since 1913, public domain): turns an amount in one year's dollars
// into another year's dollars. Historical aircraft prices are stored in the money of their time (Phase 4.4).
import cpiJson from './generated/cpi.json';

const ANNUAL = cpiJson.annual as Record<string, number>;
const YEARS = Object.keys(ANNUAL).map(Number).sort((a, b) => a - b);
const FIRST = YEARS[0]!;
const LAST = YEARS.at(-1)!;

/** Price index of a year (years outside the table use its first or last year). */
export function cpiOf(year: number): number {
  return ANNUAL[String(Math.min(LAST, Math.max(FIRST, Math.round(year))))]!;
}

/** `usd` in `fromYear` dollars, expressed in `toYear` dollars. */
export const usdInYear = (usd: number, fromYear: number, toYear: number): number => (usd * cpiOf(toYear)) / cpiOf(fromYear);

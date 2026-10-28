// Economy and air travel by country and year since 1970 (Phase 5.2): World Bank population, GDP per person and a
// modelled demand index (relative to 2024, the year of the game's real traffic data) — see tools/build-history.ts.
import economy from './generated/economy-history.json';

const FIRST = economy.years[0]!;
const LAST = economy.years[1]!;
const INDEX = economy.demandIndex as Record<string, number[]>;

/** Index values sit in the middle of each year; between them it is interpolated, after the last year it is 1. */
function at(series: number[], year: number): number {
  const x = year - FIRST - 0.5;
  if (x <= 0) return series[0]!;
  const i = Math.floor(x);
  if (i >= series.length - 1) return 1;
  return series[i]! + (series[i + 1]! - series[i]!) * (x - i);
}

/** How much air travel a country had at a (fractional) year compared with 2024 (1 = as in 2024). */
export function demandIndex(country: string, year: number): number {
  if (year >= LAST + 0.5) return 1;
  return at(INDEX[country] ?? economy.world.modelIndex, year);
}

/** The world's modelled index (traffic-weighted). */
export const worldDemandIndex = (year: number): number => (year >= LAST + 0.5 ? 1 : at(economy.world.modelIndex, year));

export const ECONOMY_YEARS = economy.years as [number, number];
export const WORLD_ECONOMY = economy.world;
export const INCOME_ELASTICITY = economy.incomeElasticity;

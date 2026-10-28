// Jet fuel prices: US Gulf Coast kerosene-type jet fuel spot price (US EIA, public domain),
// weekly, in US dollars per gallon. Series EER_EPJK_PF4_RGC_DPG, downloaded 2026-10-27.
// The game follows the real prices of 2026 week by week; before that the monthly history since 1970 (Phase 5.2,
// `generated/fuel-history.json`); after the real data the price is simulated (engine/worldEvents.ts).
import fuelHistory from './generated/fuel-history.json';

export const FUEL_SOURCE_DATE = '2026-10-16';

/** [week ending (YYYY-MM-DD), USD per gallon] */
export const JET_FUEL_SPOT_USD_PER_GAL: readonly [string, number][] = [
  ['2025-12-26', 1.95],
  ['2026-01-02', 1.908],
  ['2026-01-09', 1.873],
  ['2026-01-16', 2.015],
  ['2026-01-23', 2.095],
  ['2026-01-30', 2.184],
  ['2026-02-06', 2.12],
  ['2026-02-13', 2.154],
  ['2026-02-20', 2.317],
  ['2026-02-27', 2.469],
  ['2026-03-06', 3.103],
  ['2026-03-13', 3.478],
  ['2026-03-20', 4.038],
  ['2026-03-27', 4.009],
  ['2026-04-03', 4.073],
  ['2026-04-10', 3.925],
  ['2026-04-17', 3.709],
  ['2026-04-24', 3.906],
  ['2026-05-01', 4.16],
  ['2026-05-08', 4.049],
  ['2026-05-15', 4.152],
  ['2026-05-22', 4.113],
  ['2026-05-29', 3.297],
  ['2026-06-05', 3.371],
  ['2026-06-12', 3.185],
  ['2026-06-19', 2.839],
  ['2026-06-26', 2.788],
  ['2026-07-03', 2.816],
  ['2026-07-10', 2.971],
  ['2026-07-17', 3.497],
  ['2026-07-24', 3.676],
  ['2026-07-31', 3.736],
  ['2026-08-07', 3.431],
  ['2026-08-14', 3.77],
  ['2026-08-21', 3.922],
  ['2026-08-28', 3.715],
  ['2026-09-04', 4.082],
  ['2026-09-11', 4.418],
  ['2026-09-18', 4.584],
  ['2026-09-25', 4.351],
  ['2026-10-02', 4.416],
  ['2026-10-09', 4.405],
  ['2026-10-16', 4.5],
];

/** Airlines pay more than the spot price: transport, storage and into-plane fees (rough average). */
export const INTO_PLANE_USD_PER_GAL = 0.3;
/** Jet A-1 density: about 0.8 kg per litre → 3.03 kg per US gallon. */
export const KG_PER_GALLON = 3.03;

const SERIES = JET_FUEL_SPOT_USD_PER_GAL.map(([date, price]) => [Date.parse(date), price] as const);

const HISTORY_START = Date.UTC(Number(fuelHistory.start.slice(0, 4)), Number(fuelHistory.start.slice(5, 7)) - 1, 1);
const MONTH_MS = 30.436875 * 86_400_000;

/** Monthly history (money of that time), interpolated between the middles of the months. */
function historicSpot(t: number): number {
  const v = fuelHistory.usdPerGallon;
  const x = Math.max(0, (t - HISTORY_START) / MONTH_MS - 0.5);
  const i = Math.min(v.length - 1, Math.floor(x));
  const next = i + 1 < v.length ? v[i + 1]! : SERIES[0]![1];
  return v[i]! + (next - v[i]!) * Math.min(1, x - i);
}

/** Spot price (USD/gal) of the latest week on or before `date` (monthly history before the weekly data). */
export function jetFuelSpot(date: Date): number {
  const t = date.getTime();
  if (t < SERIES[0]![0]) return historicSpot(t);
  let price = SERIES[0]![1];
  for (const [at, value] of SERIES) {
    if (at > t) break;
    price = value;
  }
  return price;
}

/** What an airline pays for one kg of fuel (USD). */
export const fuelUsdPerKg = (date: Date): number => (jetFuelSpot(date) + INTO_PLANE_USD_PER_GAL) / KG_PER_GALLON;

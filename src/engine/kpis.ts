// Airline key figures (KPIs) as real airlines report them, from an accounting period. ASK = available seat-km
// (every seat flown one km), RPK = revenue passenger-km. RASK/CASK = revenue/cost per ASK: an airline earns money
// when RASK > CASK. Yield = revenue per RPK (what a passenger pays per km).
import type { PnlPeriod } from './finance';
import { pnlCosts, type Route } from './state';

export interface Kpis {
  revenue: number;
  costs: number;
  result: number;
  /** Result ÷ revenue (null without revenue). */
  margin: number | null;
  pax: number;
  flights: number;
  ask: number;
  rpk: number;
  loadFactor: number | null;
  /** Book currency per ASK. */
  rask: number | null;
  cask: number | null;
  caskExFuel: number | null;
  /** Book currency per RPK. */
  yield: number | null;
  blockHours: number | null;
  /** Block hours per aircraft per day. */
  utilisation: number | null;
}

/**
 * KPIs of a period. Periods from before Phase 1.5 have no seat-km: they are rebuilt from the routes' distances
 * (closed routes then count as 0 km) and have no block hours.
 */
export function periodKpis(period: PnlPeriod, routes: Readonly<Record<string, Route>>, days: number, activeAircraft: number): Kpis {
  let ask = 0;
  let rpk = 0;
  let pax = 0;
  let flights = 0;
  let block: number | null = 0;
  for (const [id, s] of Object.entries(period.routes)) {
    const km = routes[id]?.distanceKm ?? 0;
    ask += s.ask ?? s.seats * km;
    rpk += s.rpk ?? s.pax * km;
    pax += s.pax;
    flights += s.flights;
    block = s.blockHours === undefined || block === null ? null : block + s.blockHours;
  }
  const revenue = period.lines.revenue;
  const costs = pnlCosts(period.lines);
  const per = (x: number, base: number) => (base > 0 ? x / base : null);
  return {
    revenue,
    costs,
    result: revenue - costs,
    margin: per(revenue - costs, revenue),
    pax,
    flights,
    ask,
    rpk,
    loadFactor: per(rpk, ask),
    rask: per(revenue, ask),
    cask: per(costs, ask),
    caskExFuel: per(costs - period.lines.fuel, ask),
    yield: per(revenue, rpk),
    blockHours: block,
    utilisation: block !== null && activeAircraft > 0 && days > 0 ? block / activeAircraft / days : null,
  };
}

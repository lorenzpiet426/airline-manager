// Accounting periods: adding up profit-and-loss figures from days into weeks, months, quarters and years.
import { emptyPnl, type PnlLines, type PnlWeek, type RouteStats } from './state';
import type { SimTime } from './time';

/** A profit-and-loss period (a day, week, month, quarter or year): same shape as a week. */
export type PnlPeriod = PnlWeek;

export const newPeriod = (start: SimTime): PnlPeriod => ({ start, lines: emptyPnl(), routes: {} });

/** Adds all figures of `src` into `target`. */
export function mergePnl(target: PnlPeriod, src: PnlPeriod): void {
  for (const key of Object.keys(src.lines) as (keyof PnlLines)[]) target.lines[key] = (target.lines[key] ?? 0) + (src.lines[key] ?? 0);
  for (const [id, s] of Object.entries(src.routes)) {
    const t: RouteStats = (target.routes[id] ??= { flights: 0, seats: 0, pax: 0, revenue: 0, directCosts: 0 });
    t.flights += s.flights;
    t.seats += s.seats;
    t.pax += s.pax;
    t.revenue += s.revenue;
    t.directCosts += s.directCosts;
    if (s.ask !== undefined) t.ask = (t.ask ?? 0) + s.ask;
    if (s.rpk !== undefined) t.rpk = (t.rpk ?? 0) + s.rpk;
    if (s.blockHours !== undefined) t.blockHours = (t.blockHours ?? 0) + s.blockHours;
  }
}

/** Sums several periods into one that starts at `start`. */
export function sumPeriods(start: SimTime, periods: readonly PnlPeriod[]): PnlPeriod {
  const total = newPeriod(start);
  for (const p of periods) mergePnl(total, p);
  return total;
}

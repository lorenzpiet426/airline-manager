// Real-clock games (Phase 3): the world keeps running while the app is closed. When the player comes back, the missed
// time is simulated in one go and summed up in a "While you were away" report.
import type { Money } from './money';
import { pnlCosts, type GameMessage, type GameState, type PnlLines } from './state';
import type { SimTime } from './time';

/** What the report needs to remember from before the catch-up. */
export interface AwayMark {
  airlineId: string;
  from: SimTime;
  cash: Money;
  /** The running week's figures at the start (they are counted again when that week closes). */
  weekStart: SimTime;
  week: { revenue: number; costs: number; pax: number; flights: number };
  lastMessageId: number;
}

export interface AwaySummary {
  from: SimTime;
  to: SimTime;
  cashBefore: Money;
  cashAfter: Money;
  revenue: number;
  result: number;
  pax: number;
  flights: number;
  messages: GameMessage[];
}

const MAX_MESSAGES = 40;

function weekFigures(lines: PnlLines, routes: Record<string, { pax: number; flights: number }>) {
  const r = Object.values(routes);
  return { revenue: lines.revenue, costs: pnlCosts(lines), pax: r.reduce((s, x) => s + x.pax, 0), flights: r.reduce((s, x) => s + x.flights, 0) };
}

export function markAway(state: GameState, airlineId: string): AwayMark | null {
  const airline = state.airlines[airlineId];
  const fin = state.finance[airlineId];
  if (!airline || !fin) return null;
  return {
    airlineId,
    from: state.time,
    cash: { ...airline.cash },
    weekStart: fin.week.start,
    week: weekFigures(fin.week.lines, fin.week.routes),
    lastMessageId: state.messages.at(-1)?.id ?? 0,
  };
}

/** Sums up everything since the mark: closed weeks since then plus the running week, minus what was already there. */
export function awaySummary(state: GameState, mark: AwayMark): AwaySummary | null {
  const airline = state.airlines[mark.airlineId];
  const fin = state.finance[mark.airlineId];
  if (!airline || !fin) return null;
  const weeks = [...fin.history.filter((w) => w.start >= mark.weekStart), fin.week].map((w) => weekFigures(w.lines, w.routes));
  const sum = (k: keyof AwayMark['week']) => weeks.reduce((s, w) => s + w[k], 0) - mark.week[k];
  const revenue = sum('revenue');
  return {
    from: mark.from,
    to: state.time,
    cashBefore: mark.cash,
    cashAfter: { ...airline.cash },
    revenue,
    result: revenue - sum('costs'),
    pax: sum('pax'),
    flights: sum('flights'),
    messages: state.messages
      .filter((m) => m.id > mark.lastMessageId && m.airlineId === mark.airlineId)
      .slice(-MAX_MESSAGES)
      .reverse(),
  };
}

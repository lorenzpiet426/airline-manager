// Creating a new game world.
import { ECB_RATES, FX_DATE } from '../data/currencies';
import { schedule } from './core';
import { refreshMarket } from './market';
import { newFinance } from './operations';
import { sumPeriods } from './finance';
import { SAVE_VERSION, type GameOptions, type GameState, type PnlWeek } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, startOfMonth, startOfNextMonth } from './time';

export interface NewGameOptions extends GameOptions {
  seed: number;
  startYear: number;
}

export function createGame(options: NewGameOptions): GameState {
  const startTime = simTime(options.startYear, 1, 1);
  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed >>> 0,
    rng: options.seed >>> 0,
    time: startTime,
    startTime,
    options: { timeMode: options.timeMode, realism: options.realism },
    fx: { ...ECB_RATES },
    fxDate: FX_DATE,
    airlines: {},
    aircraft: {},
    market: { offers: [] },
    routes: {},
    finance: {},
    queue: [],
    messages: [],
    ledger: [],
    nextId: 1,
  };
  refreshMarket(state);
  schedule(state, { at: startOfNextMonth(startTime), kind: 'monthStart' });
  schedule(state, { at: startTime + MINUTES_PER_DAY, kind: 'dayStart' });
  return state;
}

/** Checks a loaded save and upgrades older versions step by step. Returns null if it can't be used. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as GameState;
  if (state.version === 1) {
    // Version 2 (Phase 1.4): routes, weekly accounts and the daily operations step.
    state.routes = {};
    state.finance = Object.fromEntries(Object.keys(state.airlines).map((id) => [id, newFinance(state.time)]));
    schedule(state, { at: startOfDay(state.time) + MINUTES_PER_DAY, kind: 'dayStart' });
    state.version = 2;
  }
  if (state.version === 2) {
    // Version 3 (balance update): overheads as a new profit-and-loss line.
    for (const fin of Object.values(state.finance)) {
      for (const week of [fin.week, ...fin.history]) week.lines.overhead ??= 0;
    }
    state.version = 3;
  }
  if (state.version === 3) {
    // Version 4 (finance history): monthly accounts, rebuilt from the stored weeks
    // (a week that spans two months counts for the month it starts in).
    for (const fin of Object.values(state.finance)) {
      const byMonth = new Map<number, PnlWeek[]>();
      for (const week of [...fin.history, fin.week]) {
        const m = startOfMonth(week.start);
        byMonth.set(m, [...(byMonth.get(m) ?? []), week]);
      }
      const current = startOfMonth(state.time);
      fin.months = [...byMonth.entries()]
        .filter(([m]) => m < current)
        .sort(([a], [b]) => a - b)
        .map(([m, weeks]) => sumPeriods(m, weeks));
      fin.month = sumPeriods(current, byMonth.get(current) ?? []);
    }
    state.version = 4;
  }
  if (state.version !== SAVE_VERSION) return null;
  return state;
}

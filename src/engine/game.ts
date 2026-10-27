// Creating a new game world.
import { ECB_RATES, FX_DATE } from '../data/currencies';
import { schedule } from './core';
import { refreshMarket } from './market';
import { newFinance } from './operations';
import { SAVE_VERSION, type GameOptions, type GameState } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, startOfNextMonth } from './time';

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
  if (state.version !== SAVE_VERSION) return null;
  return state;
}

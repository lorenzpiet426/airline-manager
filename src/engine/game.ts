// Creating a new game world.
import { ECB_RATES, FX_DATE } from '../data/currencies';
import { schedule } from './core';
import { refreshMarket } from './market';
import { SAVE_VERSION, type GameOptions, type GameState } from './state';
import { simTime, startOfNextMonth } from './time';

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
    queue: [],
    messages: [],
    ledger: [],
    nextId: 1,
  };
  refreshMarket(state);
  schedule(state, { at: startOfNextMonth(startTime), kind: 'monthStart' });
  return state;
}

/** Checks a loaded save and upgrades older versions (none yet). Returns null if it can't be used. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as GameState;
  if (state.version !== SAVE_VERSION) return null;
  return state;
}

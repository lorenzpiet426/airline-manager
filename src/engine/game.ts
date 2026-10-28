// Creating a new game world.
import { ECB_RATES, FX_DATE } from '../data/currencies';
import { getAircraftType } from '../data/aircraft';
import { DEFAULT_CLASS_FARES, economyCabin, standardCabin, totalSeats } from './cabins';
import { schedule } from './core';
import { awarenessTarget, newReputation } from './reputation';
import { refreshMarket } from './market';
import { newFinance } from './operations';
import { sumPeriods } from './finance';
import { emptyAi, SAVE_VERSION, type GameOptions, type GameState, type PnlWeek } from './state';
import { MINUTES_PER_DAY, simTime, startOfDay, startOfMonth, startOfNextMonth, type SimTime } from './time';

export interface NewGameOptions extends GameOptions {
  seed: number;
  startYear: number;
  /** Start at this moment instead of 1 January (real-clock games start now). */
  startTime?: SimTime;
}

export function createGame(options: NewGameOptions): GameState {
  const startTime = options.startTime ?? simTime(options.startYear, 1, 1);
  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed >>> 0,
    rng: options.seed >>> 0,
    time: startTime,
    startTime,
    options: { timeMode: options.timeMode, realism: options.realism, scheduling: options.scheduling },
    fx: { ...ECB_RATES },
    fxDate: FX_DATE,
    airlines: {},
    aircraft: {},
    market: { offers: [], sales: [] },
    routes: {},
    flights: {},
    finance: {},
    ai: emptyAi(),
    reputation: {},
    queue: [],
    messages: [],
    ledger: [],
    nextId: 1,
  };
  refreshMarket(state);
  schedule(state, { at: startOfNextMonth(startTime), kind: 'monthStart' });
  schedule(state, { at: startOfDay(startTime) + MINUTES_PER_DAY, kind: 'dayStart' });
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
  if (state.version === 4) {
    // Version 5 (2.1b): the AI airlines start from the real-world data with no changes yet.
    state.ai = emptyAi();
    state.version = 5;
  }
  if (state.version === 5) {
    // Version 6 (2.2): timetables. Older games keep Simple scheduling; their flight pairs are planned on loading
    // (ensureFlights, needs the world data).
    state.options.scheduling = 'simple';
    state.flights = {};
    state.version = 6;
  }
  if (state.version === 6) {
    // Version 7 (Phase 2 cabins): every aircraft and lease offer gets an all-economy cabin with its seats; routes get
    // premium fares; the player's airlines get a reputation (awareness from the passengers they already carry); two new
    // profit-and-loss lines.
    for (const a of Object.values(state.aircraft)) {
      a.cabin ??= economyCabin(getAircraftType(a.typeId), a.seats);
      a.seats = totalSeats(a.cabin);
    }
    for (const o of state.market.offers) {
      o.cabin ??= standardCabin(getAircraftType(o.typeId), 'single');
      o.seats = totalSeats(o.cabin);
    }
    for (const r of Object.values(state.routes)) r.classFares ??= { ...DEFAULT_CLASS_FARES };
    state.reputation = {};
    for (const airline of Object.values(state.airlines)) {
      if (airline.controller !== 'human') continue;
      const last = state.finance[airline.id]?.history.at(-1);
      const pax = last ? Object.values(last.routes).reduce((s, r) => s + r.pax, 0) : 0;
      state.reputation[airline.id] = newReputation(pax > 0 ? awarenessTarget(pax) : undefined);
    }
    for (const fin of Object.values(state.finance)) {
      for (const p of [fin.week, fin.month, ...fin.history, ...fin.months]) {
        p.lines.service ??= 0;
        p.lines.depreciation ??= 0;
      }
    }
    state.version = 7;
  }
  if (state.version === 7) {
    // Version 8 (Phase 4.1): used aircraft for sale, a new P&L line for aircraft sales; leases end (checked daily).
    state.market.sales = [];
    refreshMarket(state);
    for (const fin of Object.values(state.finance)) {
      for (const p of [fin.week, fin.month, ...fin.history, ...fin.months]) p.lines.disposals ??= 0;
    }
    state.version = 8;
  }
  if (state.version !== SAVE_VERSION) return null;
  return state;
}

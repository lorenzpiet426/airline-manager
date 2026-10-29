// The engine's home: a background thread (Web Worker). It owns the game state, runs the clock
// and applies commands; the screen only receives copies of the state to display.
import { withStartups } from '../engine/startups';
import { ensureSlots } from '../engine/slots';
import { ensureHubFacilities } from '../engine/hub';
import { ensureCrew } from '../engine/crews';
import { ensureLabour } from '../engine/unions';
import * as Comlink from 'comlink';
import type { Airport, Country } from '../data/types';
import { advance, type WorldProvider } from '../engine/advance';
import { applyCommand, type Command, type CommandResult } from '../engine/commands';
import { worldCache } from '../engine/world';
import { loadFxHistory } from '../data/fxHistory';
import { loadAirportHistory } from '../data/airportHistory';
import { loadRealAirlines } from '../data/realAirlinesData';
import { createGame, migrate, type NewGameOptions } from '../engine/game';
import { ensureFlights } from '../engine/schedule';
import { decodeSave, encodeSave, summarize, type SaveSummary } from '../persistence/saveFile';
import type { GameState } from '../engine/state';
import { fromDate, MINUTES_PER_DAY, simTime, toDate, type SimTime } from '../engine/time';
import { awaySummary, markAway } from '../engine/away';
import type { AwayReport, EngineSnapshot, Speed } from './protocol';

const TICK_MS = 100;
/** Real clock: how often the game time is set to the real time. */
const LIVE_TICK_MS = 1000;
/** Real clock: gaps from this many minutes on are a catch-up with a "While you were away" report. */
const AWAY_REPORT_MIN = 60;
/** Real clock: during a catch-up, the screen hears about the progress every this many game days. */
const CATCH_UP_STEP_DAYS = 7;

export interface Outcome {
  result: CommandResult;
  snapshot: EngineSnapshot;
}

let state: GameState | null = null;
let speed: Speed = 0;
let carry = 0; // fractions of a game minute not yet simulated
let lastTick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let listener: ((snapshot: EngineSnapshot) => void) | null = null;
let rev = 0;
let worldPromise: Promise<WorldProvider> | null = null;
/** Set once the world data has loaded; the clock only runs with a loaded world. Gives each game the world of its date. */
let world: WorldProvider | null = null;
let liveTimer: ReturnType<typeof setInterval> | null = null;
let catchingUp: { from: SimTime; to: SimTime } | null = null;
let away: AwayReport | null = null;

function loadWorld(): Promise<WorldProvider> {
  worldPromise ??= Promise.all([
    import('../data/generated/airports.json'),
    import('../data/generated/countries.json'),
    loadRealAirlines(),
    loadFxHistory(),
    loadAirportHistory(),
  ]).then(([airports, countries, realAirlines, fxHistory, airportHistory]) => {
    const at = worldCache({
      airports: airports.default as Airport[],
      countries: countries.default as unknown as Record<string, Country>,
      realAirlines,
      fxHistory,
      airportHistory,
    });
    // Plus the fictional startups founded in this game (Phase 6.4).
    return (world = (s: GameState) => withStartups(at(s.options.startYear, toDate(s.time)), s));
  });
  return worldPromise;
}

/** Sends the new state to the screen and returns the same snapshot. */
function emit(): EngineSnapshot {
  const snapshot: EngineSnapshot = { rev: ++rev, state, speed, ...(catchingUp ? { catchingUp } : {}), ...(away ? { away } : {}) };
  away = null;
  listener?.(snapshot);
  return snapshot;
}

function tick() {
  const now = performance.now();
  if (!state || !world || speed === 0) return;
  carry += ((now - lastTick) / 1000) * speed;
  lastTick = now;
  const minutes = Math.floor(carry);
  if (minutes < 1) return;
  carry -= minutes;
  advance(state, world, state.time + minutes);
  emit();
}

/** Real clock: the game time that matches the real time now. */
const realNow = (s: GameState): SimTime => fromDate(new Date()) + (s.options.clockOffset ?? 0);

/**
 * Real clock: brings the game up to the real time. Small steps just advance; a longer gap (the app was closed or in
 * the background) is simulated week by week with progress for the screen, then summed up in a report.
 */
let busy = false;
async function liveTick(): Promise<void> {
  if (busy || !state || !world || state.options.timeMode !== 'realclock') return;
  const target = realNow(state);
  if (target <= state.time) return;
  busy = true;
  try {
    const s = state;
    if (target - s.time < AWAY_REPORT_MIN) {
      advance(s, world, target);
      emit();
      return;
    }
    const player = Object.values(s.airlines).find((a) => a.controller === 'human');
    const mark = player ? markAway(s, player.id) : null;
    catchingUp = { from: s.time, to: target };
    emit();
    while (s.time < target && state === s) {
      advance(s, world, Math.min(target, s.time + CATCH_UP_STEP_DAYS * MINUTES_PER_DAY));
      emit();
      await new Promise((resolve) => setTimeout(resolve, 0)); // let commands and the screen in between
    }
    catchingUp = null;
    if (state === s && mark) away = awaySummary(s, mark);
    emit();
  } finally {
    busy = false;
  }
}

function startLive(): void {
  if (!liveTimer) liveTimer = setInterval(() => void liveTick(), LIVE_TICK_MS);
  void liveTick();
}

function stopLive(): void {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = null;
  catchingUp = null;
}

function setSpeed(next: Speed): EngineSnapshot {
  speed = state?.options.timeMode === 'realtime' ? next : 0;
  if (state?.options.timeMode === 'realclock') startLive();
  else stopLive();
  carry = 0;
  lastTick = performance.now();
  if (speed > 0 && !timer) timer = setInterval(tick, TICK_MS);
  if (speed === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
  return emit();
}

async function loadState(raw: unknown): Promise<EngineSnapshot | null> {
  const world = await loadWorld();
  const loaded = migrate(raw);
  if (!loaded) return null;
  ensureFlights(loaded, world(loaded));
  // Games from before Phase 7.2: the timetable keeps its slots (historic rights).
  ensureSlots(loaded, world(loaded));
  ensureHubFacilities(loaded, world(loaded));
  ensureCrew(loaded, world(loaded));
  ensureLabour(loaded, world(loaded));
  state = loaded;
  return setSpeed(0);
}

const api = {
  subscribe(callback: (snapshot: EngineSnapshot) => void) {
    listener = callback;
    emit();
  },

  /** Creates a new world and founds the player's airline in it. */
  async newGame(options: NewGameOptions, founding: Extract<Command, { type: 'FoundAirline' | 'TakeOverAirline' }>): Promise<Outcome> {
    const world = await loadWorld();
    const next = createGame(options, world({ options: { startYear: options.startYear }, time: options.startTime ?? simTime(options.startYear, 1, 1) } as GameState));
    const result = applyCommand(next, world(next), founding);
    if (result.ok) state = next;
    return { result, snapshot: setSpeed(0) };
  },

  /** Loads a saved game (its state as plain data). Returns null if the save cannot be used. */
  load: loadState,

  async command(command: Command): Promise<Outcome> {
    if (!state) return { result: { ok: false, error: 'airlineUnknown' }, snapshot: emit() };
    const result = applyCommand(state, (await loadWorld())(state), command);
    // Switching to the real clock starts it (and catches up to today).
    if (result.ok && command.type === 'SetTimeMode') return { result, snapshot: setSpeed(0) };
    return { result, snapshot: emit() };
  },

  /** Real clock: catch up now (the app came back to the foreground). */
  async wake(): Promise<void> {
    await liveTick();
  },

  setSpeed,

  /** Turn-based mode: simulate the next 7 days. */
  async endWeek(): Promise<EngineSnapshot> {
    if (state?.options.timeMode === 'weekly') advance(state, await loadWorld(), state.time + 7 * MINUTES_PER_DAY);
    return emit();
  },

  /** Packs the running game into a compressed save file (here, so the screen never stalls). */
  serialize(name: string): { bytes: Uint8Array; summary: SaveSummary } | null {
    if (!state) return null;
    const bytes = encodeSave(state, name, Date.now());
    return Comlink.transfer({ bytes, summary: summarize(state) }, [bytes.buffer as ArrayBuffer]);
  },

  /** Loads a save file (from the database or an imported file). Returns null if it is not a usable save. */
  async loadBytes(bytes: Uint8Array): Promise<EngineSnapshot | null> {
    let raw: unknown;
    try {
      raw = decodeSave(bytes).state;
    } catch {
      return null;
    }
    return loadState(raw);
  },

  quit(): EngineSnapshot {
    state = null;
    return setSpeed(0);
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);

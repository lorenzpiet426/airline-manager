// The engine's home: a background thread (Web Worker). It owns the game state, runs the clock
// and applies commands; the screen only receives copies of the state to display.
import * as Comlink from 'comlink';
import type { Airport, Country } from '../data/types';
import { advance } from '../engine/advance';
import { applyCommand, type Command, type CommandResult } from '../engine/commands';
import { buildEngineWorld, type EngineWorld } from '../engine/world';
import { createGame, migrate, type NewGameOptions } from '../engine/game';
import type { GameState } from '../engine/state';
import { MINUTES_PER_DAY } from '../engine/time';
import type { EngineSnapshot, Speed } from './protocol';

const TICK_MS = 100;

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
let worldPromise: Promise<EngineWorld> | null = null;
/** Set once the world data has loaded; the clock only runs with a loaded world. */
let world: EngineWorld | null = null;

function loadWorld(): Promise<EngineWorld> {
  worldPromise ??= Promise.all([import('../data/generated/airports.json'), import('../data/generated/countries.json')]).then(
    ([airports, countries]) =>
      (world = buildEngineWorld(airports.default as Airport[], countries.default as unknown as Record<string, Country>)),
  );
  return worldPromise;
}

/** Sends the new state to the screen and returns the same snapshot. */
function emit(): EngineSnapshot {
  const snapshot = { rev: ++rev, state, speed };
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

function setSpeed(next: Speed): EngineSnapshot {
  speed = state?.options.timeMode === 'realtime' ? next : 0;
  carry = 0;
  lastTick = performance.now();
  if (speed > 0 && !timer) timer = setInterval(tick, TICK_MS);
  if (speed === 0 && timer) {
    clearInterval(timer);
    timer = null;
  }
  return emit();
}

const api = {
  subscribe(callback: (snapshot: EngineSnapshot) => void) {
    listener = callback;
    emit();
  },

  /** Creates a new world and founds the player's airline in it. */
  async newGame(options: NewGameOptions, founding: Extract<Command, { type: 'FoundAirline' }>): Promise<Outcome> {
    const world = await loadWorld();
    const next = createGame(options);
    const result = applyCommand(next, world, founding);
    if (result.ok) state = next;
    return { result, snapshot: setSpeed(0) };
  },

  /** Loads a saved game. Returns false if the save cannot be used. */
  async load(raw: unknown): Promise<EngineSnapshot | null> {
    await loadWorld();
    const loaded = migrate(raw);
    if (!loaded) return null;
    state = loaded;
    return setSpeed(0);
  },

  async command(command: Command): Promise<Outcome> {
    if (!state) return { result: { ok: false, error: 'airlineUnknown' }, snapshot: emit() };
    const result = applyCommand(state, await loadWorld(), command);
    return { result, snapshot: emit() };
  },

  setSpeed,

  /** Turn-based mode: simulate the next 7 days. */
  async endWeek(): Promise<EngineSnapshot> {
    if (state) advance(state, await loadWorld(), state.time + 7 * MINUTES_PER_DAY);
    return emit();
  },

  quit(): EngineSnapshot {
    state = null;
    return setSpeed(0);
  },
};

export type EngineApi = typeof api;

Comlink.expose(api);

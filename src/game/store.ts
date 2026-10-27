// The screen's link to the engine worker. Screens read the latest game state with useGame()
// and send decisions with sendCommand(). The current game is saved automatically on this device
// (one autosave for now; save slots, export and import follow in Phase 1.5).
import { useSyncExternalStore } from 'react';
import * as Comlink from 'comlink';
import type { Command, CommandResult, FoundAirline } from '../engine/commands';
import type { NewGameOptions } from '../engine/game';
import type { GameState } from '../engine/state';
import { MINUTES_PER_DAY } from '../engine/time';
import type { EngineApi, Outcome } from '../worker/engine.worker';
import type { EngineSnapshot, Speed } from '../worker/protocol';

const AUTOSAVE_KEY = 'am.autosave.v1';

let snapshot: EngineSnapshot = { rev: 0, state: null, speed: 0 };
/** True until the autosave has been checked (so screens don't flash "no game"). */
let booting = true;
const listeners = new Set<() => void>();
let engine: Comlink.Remote<EngineApi> | null = null;
let lastSavedDay = -1;

function notify() {
  listeners.forEach((listener) => listener());
}

function getEngine(): Comlink.Remote<EngineApi> {
  if (!engine) {
    const worker = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' });
    engine = Comlink.wrap<EngineApi>(worker);
    void engine.subscribe(
      Comlink.proxy((next: EngineSnapshot) => {
        accept(next);
        autosave(false);
      }),
    );
  }
  return engine;
}

/** Takes a snapshot from the engine unless a newer one has already arrived. */
function accept(next: EngineSnapshot | null) {
  if (!next || next.rev <= snapshot.rev) return;
  snapshot = next;
  notify();
}

/** Applies the snapshot of a command's outcome, saves, and hands back the result. */
function settle(outcome: Outcome): CommandResult {
  accept(outcome.snapshot);
  autosave(true);
  return outcome.result;
}

/** Saves at most once per game day while the clock runs, and always when forced. */
function autosave(force: boolean) {
  const state = snapshot.state;
  if (!state) return;
  const day = Math.floor(state.time / MINUTES_PER_DAY);
  if (!force && day === lastSavedDay) return;
  lastSavedDay = day;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the game keeps running, it just isn't saved.
  }
}

async function boot() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) {
      const loaded = await getEngine().load(JSON.parse(raw));
      if (loaded) accept(loaded);
      else localStorage.removeItem(AUTOSAVE_KEY);
    }
  } catch {
    // A broken save is ignored; the player can start a new game.
  }
  booting = false;
  notify();
}

if (typeof window !== 'undefined') {
  void boot();
  // Save when the app goes to the background (phones may close it without warning).
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && autosave(true));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => snapshot.state;
const getSpeed = () => snapshot.speed;
const getBooting = () => booting;

/** The current game, or null when no game is running. */
export function useGame(): GameState | null {
  return useSyncExternalStore(subscribe, getState);
}

export function useSpeed(): Speed {
  return useSyncExternalStore(subscribe, getSpeed);
}

export function useBooting(): boolean {
  return useSyncExternalStore(subscribe, getBooting);
}

/** The human player's airline id (the first human airline). */
export function playerAirlineId(state: GameState): string | null {
  return Object.values(state.airlines).find((a) => a.controller === 'human')?.id ?? null;
}

export async function startNewGame(options: NewGameOptions, founding: FoundAirline): Promise<CommandResult> {
  return settle(await getEngine().newGame(options, founding));
}

export async function sendCommand(command: Command): Promise<CommandResult> {
  return settle(await getEngine().command(command));
}

export async function setSpeed(speed: Speed): Promise<void> {
  accept(await getEngine().setSpeed(speed));
  if (speed === 0) autosave(true);
}

export async function endWeek(): Promise<void> {
  accept(await getEngine().endWeek());
  autosave(true);
}

export async function quitGame(): Promise<void> {
  accept(await getEngine().quit());
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing to remove.
  }
}

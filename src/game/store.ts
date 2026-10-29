// The screen's link to the engine worker. Screens read the latest game state with useGame()
// and send decisions with sendCommand(). Every game has its own save slot on this device (IndexedDB) and is saved
// automatically; copies, export and import are in the Saves screen (Phase 1.5).
import { useSyncExternalStore } from 'react';
import * as Comlink from 'comlink';
import type { Command, CommandResult, FoundAirline, TakeOverAirline } from '../engine/commands';
import type { NewGameOptions } from '../engine/game';
import type { GameState } from '../engine/state';
import { MINUTES_PER_DAY, toDate } from '../engine/time';
import { SAVE_EXTENSION } from '../persistence/saveFile';
import {
  currentSlotId,
  deleteSlot,
  listSlots,
  newSlotId,
  readSlot,
  requestPersistence,
  setCurrentSlotId,
  writeSlot,
  type SlotMeta,
} from '../persistence/saves';
import type { EngineApi, Outcome } from '../worker/engine.worker';
import type { AwayReport, EngineSnapshot, Speed } from '../worker/protocol';

/** The single autosave of versions before Phase 1.5 (moved into a save slot on first start). */
const LEGACY_AUTOSAVE_KEY = 'am.autosave.v1';
/** While the clock runs, save at most this often (real time); always on pause, commands and leaving the app. */
const AUTOSAVE_INTERVAL_MS = 15_000;

let snapshot: EngineSnapshot = { rev: 0, state: null, speed: 0 };
/** True until the last game has been reopened (so screens don't flash "no game"). */
let booting = true;
const listeners = new Set<() => void>();
let engine: Comlink.Remote<EngineApi> | null = null;
let lastSavedDay = -1;
let lastSavedAt = 0;
/** The save slot of the open game. */
let slotId: string | null = null;
let slots: SlotMeta[] = [];
let saving: Promise<void> | null = null;
/** Cloud sync holds autosaves while it compares and replaces slots (Phase 3). */
let autosaveHeld = 0;
let autosaveMissed = false;
/** Cloud sync can make the first start wait until the newest version of the game has been downloaded. */
let bootGate: Promise<void> | null = null;
/** Real clock: the last "While you were away" report, until the player closes it. */
let awayReport: AwayReport | null = null;
let saveAgain = false;

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
  if (next.away) awayReport = next.away;
  if (!next.state) awayReport = null;
  notify();
}

/** Applies the snapshot of a command's outcome, saves, and hands back the result. */
function settle(outcome: Outcome): CommandResult {
  accept(outcome.snapshot);
  autosave(true);
  return outcome.result;
}

async function refreshSlots(): Promise<void> {
  try {
    slots = await listSlots();
  } catch {
    slots = [];
  }
  notify();
}

/** Writes the open game into its slot (packed by the engine worker). */
async function writeCurrent(): Promise<void> {
  if (!slotId || !snapshot.state) return;
  const id = slotId;
  const packed = await getEngine().serialize('');
  if (!packed || id !== slotId) return;
  await writeSlot(
    { ...packed.summary, id, kind: 'game', gameId: id, name: packed.summary.airlineName, savedAt: Date.now(), bytes: packed.bytes.byteLength },
    packed.bytes,
  );
  await refreshSlots();
}

/** Saves the open game: at most once per game day and every 15 s while the clock runs, always when forced. */
function autosave(force: boolean): Promise<void> {
  const state = snapshot.state;
  if (!state || !slotId) return Promise.resolve();
  if (autosaveHeld > 0) {
    autosaveMissed = true;
    return Promise.resolve();
  }
  const day = Math.floor(state.time / MINUTES_PER_DAY);
  if (!force && (day === lastSavedDay || Date.now() - lastSavedAt < AUTOSAVE_INTERVAL_MS)) return saving ?? Promise.resolve();
  lastSavedDay = day;
  lastSavedAt = Date.now();
  if (saving) {
    saveAgain = true;
    return saving;
  }
  saving = (async () => {
    try {
      do {
        saveAgain = false;
        await writeCurrent();
      } while (saveAgain);
    } catch {
      // Storage full or blocked: the game keeps running, it just isn't saved.
    } finally {
      saving = null;
    }
  })();
  return saving;
}

/** Makes the engine's game the open game in a (new or existing) slot and saves it. */
async function adopt(id: string): Promise<void> {
  slotId = id;
  setCurrentSlotId(id);
  lastSavedDay = -1;
  await autosave(true);
  void requestPersistence();
}

async function boot() {
  await null; // let the cloud module register its gate first
  if (bootGate) await bootGate;
  try {
    const id = currentSlotId();
    const saved = id ? await readSlot(id) : null;
    if (saved) {
      const loaded = await getEngine().loadBytes(saved.data);
      if (loaded) {
        accept(loaded);
        slotId = saved.meta.gameId;
      }
    } else {
      // Phase 1.4–2.2 kept one autosave in localStorage: move it into a save slot.
      const raw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
      if (raw) {
        const loaded = await getEngine().load(JSON.parse(raw));
        if (loaded) {
          accept(loaded);
          await adopt(newSlotId('game'));
        }
        localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
      }
    }
  } catch {
    // A broken save is ignored; the player can start a new game.
  }
  await refreshSlots();
  booting = false;
  notify();
}

if (typeof window !== 'undefined') {
  void boot();
  // Save when the app goes to the background (phones may close it without warning).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void autosave(true).then(() => visibilityHook?.('hidden'));
    // Back in the foreground: newest version from the cloud first, then (real clock) catch up the missed time.
    else
      void (async () => {
        await visibilityHook?.('visible');
        if (snapshot.state?.options.timeMode === 'realclock') await getEngine().wake();
      })();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => snapshot.state;
const getSpeed = () => snapshot.speed;
const getBooting = () => booting;
const getSlots = () => slots;
const getSlotId = () => slotId;

// ─── Hooks for cloud sync (Phase 3) ─────────────────────────────────────────

let visibilityHook: ((state: 'hidden' | 'visible') => Promise<void>) | null = null;
let deleteHook: ((ids: string[]) => void) | null = null;

/** Called by the cloud module: wait for `gate` before the first game opens; get told about app switches and deletes. */
export function connectCloud(hooks: { gate: Promise<void> | null; visibility: (state: 'hidden' | 'visible') => Promise<void>; deleted: (ids: string[]) => void }): void {
  bootGate = hooks.gate;
  visibilityHook = hooks.visibility;
  deleteHook = hooks.deleted;
}

/**
 * Runs `fn` with autosaves held back (the open game is saved first). `fn` gets the open slot's id; if it replaced that
 * slot, it returns true and the game is reopened from it, otherwise a held-back autosave is done now.
 */
export async function withAutosaveHeld(fn: (openSlotId: string | null) => Promise<boolean>): Promise<void> {
  await autosave(true);
  autosaveHeld++;
  let reopen = false;
  try {
    reopen = await fn(slotId);
  } finally {
    autosaveHeld--;
  }
  if (reopen && slotId) {
    const saved = await readSlot(slotId);
    const loaded = saved ? await getEngine().loadBytes(saved.data) : null;
    if (loaded) accept(loaded);
  } else if (autosaveMissed) {
    autosaveMissed = false;
    await autosave(true);
  }
  await refreshSlots();
}

export const reloadSlotList = refreshSlots;
const getAway = () => awayReport;
const getCatchingUp = () => snapshot.catchingUp ?? null;

/** Real clock: the "While you were away" report (null when there is none or it was closed). */
export function useAwayReport(): AwayReport | null {
  return useSyncExternalStore(subscribe, getAway);
}

export function dismissAwayReport(): void {
  awayReport = null;
  notify();
}

/** Real clock: the game is simulating the time it was closed. */
export function useCatchingUp(): EngineSnapshot['catchingUp'] | null {
  return useSyncExternalStore(subscribe, getCatchingUp);
}

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

/** All save slots on this device, newest first. */
export function useSlots(): SlotMeta[] {
  return useSyncExternalStore(subscribe, getSlots);
}

/** The slot of the open game (null when no game is open). */
export function useCurrentSlotId(): string | null {
  return useSyncExternalStore(subscribe, getSlotId);
}

/** The human player's airline id (the first human airline). */
export function playerAirlineId(state: GameState): string | null {
  return Object.values(state.airlines).find((a) => a.controller === 'human')?.id ?? null;
}

/** Starts a new game: a startup (FoundAirline) or a real airline taken over (TakeOverAirline, Phase 6.2). */
export async function startNewGame(options: NewGameOptions, founding: FoundAirline | TakeOverAirline): Promise<CommandResult> {
  await autosave(true); // keep the game that was open
  const outcome = await getEngine().newGame(options, founding);
  accept(outcome.snapshot);
  if (outcome.result.ok) await adopt(newSlotId('game'));
  return outcome.result;
}

export async function sendCommand(command: Command): Promise<CommandResult> {
  return settle(await getEngine().command(command));
}

export async function setSpeed(speed: Speed): Promise<void> {
  accept(await getEngine().setSpeed(speed));
  if (speed === 0) void autosave(true);
}

export async function endWeek(): Promise<void> {
  accept(await getEngine().endWeek());
  void autosave(true);
}

/** Saves and closes the open game (it stays in the save list). */
export async function closeGame(): Promise<void> {
  await autosave(true);
  accept(await getEngine().quit());
  slotId = null;
  setCurrentSlotId(null);
  notify();
}

/** Keeps a named snapshot of the open game ("before ordering the 787s"). */
export async function saveCopy(name: string): Promise<boolean> {
  if (!slotId) return false;
  await autosave(true);
  const packed = await getEngine().serialize(name);
  if (!packed) return false;
  const id = newSlotId('copy');
  await writeSlot({ ...packed.summary, id, kind: 'copy', gameId: slotId, name: name.trim() || packed.summary.airlineName, savedAt: Date.now(), bytes: packed.bytes.byteLength }, packed.bytes);
  await refreshSlots();
  return true;
}

/** Opens a game, or goes back to a copy (the copy then continues in its game's slot). */
export async function loadSlot(id: string): Promise<boolean> {
  await autosave(true);
  const saved = await readSlot(id);
  if (!saved) return false;
  const loaded = await getEngine().loadBytes(saved.data);
  if (!loaded) return false;
  accept(loaded);
  await adopt(saved.meta.gameId);
  return true;
}

export async function deleteSave(id: string): Promise<void> {
  if (id === slotId) await closeGame();
  const synced = await deleteSlot(id);
  if (synced.length) deleteHook?.(synced);
  await refreshSlots();
}

/** The file of a save (the open game is saved first), with a file name like "Danube Air 2026-05-22.amsave". */
export async function exportSave(id: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  if (id === slotId) await autosave(true);
  const saved = await readSlot(id);
  if (!saved) return null;
  const date = toDate(saved.meta.gameTime).toISOString().slice(0, 10);
  const base = `${saved.meta.kind === 'copy' ? `${saved.meta.airlineName} – ${saved.meta.name}` : saved.meta.airlineName} ${date}`;
  return { bytes: saved.data, fileName: `${base.replace(/[\\/:*?"<>|]+/g, '_')}${SAVE_EXTENSION}` };
}

/** Loads an exported save file as a new game slot. False if the file is not a usable save. */
export async function importSave(bytes: Uint8Array): Promise<boolean> {
  await autosave(true);
  const loaded = await getEngine().loadBytes(bytes);
  if (!loaded) return false;
  accept(loaded);
  await adopt(newSlotId('game'));
  return true;
}

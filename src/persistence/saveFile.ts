// The save file format: the game state as JSON with a small header, compressed with gzip (fflate). The same bytes are
// stored in the browser's database (IndexedDB) and written to exported ".amsave" files, so an export is simply a copy
// of a save. Older files keep working: the engine upgrades their state on loading (see engine/game.ts migrate).
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { GameState } from '../engine/state';

export const SAVE_FORMAT = 'airline-manager-save';
export const SAVE_EXTENSION = '.amsave';

/** What the save list shows without unpacking the whole game. */
export interface SaveSummary {
  airlineName: string;
  iata: string;
  colors: { primary: string; secondary: string };
  hubId: string;
  /** Game time (minutes since 1950). */
  gameTime: number;
  version: number;
}

interface SaveFileJson {
  format: typeof SAVE_FORMAT;
  formatVersion: 1;
  /** Real-world time of saving (ms since 1970). */
  savedAt: number;
  name: string;
  state: GameState;
}

export function summarize(state: GameState): SaveSummary {
  const airline = Object.values(state.airlines).find((a) => a.controller === 'human') ?? Object.values(state.airlines)[0];
  return {
    airlineName: airline?.name ?? '—',
    iata: airline?.iata ?? '',
    colors: airline?.colors ?? { primary: '#33d6ff', secondary: '#ffffff' },
    hubId: airline?.hubId ?? '',
    gameTime: state.time,
    version: state.version,
  };
}

export function encodeSave(state: GameState, name: string, savedAt: number): Uint8Array {
  const file: SaveFileJson = { format: SAVE_FORMAT, formatVersion: 1, savedAt, name, state };
  return gzipSync(strToU8(JSON.stringify(file)), { level: 6 });
}

/**
 * Reads a save file: gzip-compressed (normal) or plain JSON (hand-made backups). Also accepts the bare game state
 * of the old single autosave. Throws if it isn't a save at all.
 */
export function decodeSave(bytes: Uint8Array): { name: string; savedAt: number | null; state: unknown } {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = strFromU8(gzipped ? gunzipSync(bytes) : bytes);
  const json = JSON.parse(text) as Partial<SaveFileJson> & { version?: unknown };
  if (json.format === SAVE_FORMAT && json.state) return { name: json.name ?? '', savedAt: json.savedAt ?? null, state: json.state };
  if (typeof json.version === 'number' && 'airlines' in json) return { name: '', savedAt: null, state: json };
  throw new Error('notASave');
}

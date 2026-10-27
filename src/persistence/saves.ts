// Save slots in the browser's database (IndexedDB, via Dexie). Every game has its own slot that autosaves; "copies"
// are named snapshots of a game the player can go back to. The slot list (small) and the save data (large, compressed)
// are kept in separate tables so the list loads instantly.
import Dexie, { type Table } from 'dexie';
import type { SaveSummary } from './saveFile';

export type SlotKind = 'game' | 'copy';

export interface SlotMeta extends SaveSummary {
  id: string;
  kind: SlotKind;
  /** The game a copy belongs to (for a game slot: its own id). */
  gameId: string;
  /** Name shown in the list (copies: chosen by the player). */
  name: string;
  /** Real-world time of the last save (ms since 1970). */
  savedAt: number;
  bytes: number;
  /** Cloud sync (Phase 3): the cloud revision this slot matches, and the local save time it was synced at. */
  sync?: SlotSync;
}

export interface SlotSync {
  rev: number;
  savedAt: number;
}

interface SlotData {
  id: string;
  data: Uint8Array;
}

class SaveDb extends Dexie {
  slots!: Table<SlotMeta, string>;
  data!: Table<SlotData, string>;
  constructor() {
    super('airline-manager');
    this.version(1).stores({ slots: 'id, gameId, savedAt', data: 'id' });
  }
}

let db: SaveDb | null = null;
const getDb = () => (db ??= new SaveDb());

export const newSlotId = (kind: SlotKind) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function listSlots(): Promise<SlotMeta[]> {
  return (await getDb().slots.toArray()).sort((a, b) => b.savedAt - a.savedAt);
}

/** Writes a slot. A meta without `sync` keeps the slot's sync state (autosaves don't know it). */
export async function writeSlot(meta: SlotMeta, data: Uint8Array): Promise<void> {
  const d = getDb();
  await d.transaction('rw', d.slots, d.data, async () => {
    const sync = meta.sync ?? (await d.slots.get(meta.id))?.sync;
    await d.slots.put(sync ? { ...meta, sync } : meta);
    await d.data.put({ id: meta.id, data });
  });
}

export async function readSlot(id: string): Promise<{ meta: SlotMeta; data: Uint8Array } | null> {
  const d = getDb();
  const [meta, data] = await Promise.all([d.slots.get(id), d.data.get(id)]);
  return meta && data ? { meta, data: data.data } : null;
}

/** Records that a slot matches a cloud revision (only if it wasn't saved again meanwhile). */
export async function markSynced(id: string, sync: SlotSync): Promise<void> {
  const d = getDb();
  await d.transaction('rw', d.slots, async () => {
    const meta = await d.slots.get(id);
    if (meta && meta.savedAt === sync.savedAt) await d.slots.put({ ...meta, sync });
  });
}

/** Deletes a slot; deleting a game also deletes its copies. */
export async function deleteSlot(id: string): Promise<string[]> {
  const d = getDb();
  const meta = await d.slots.get(id);
  const ids = meta?.kind === 'game' ? (await d.slots.where('gameId').equals(id).primaryKeys()) : [id];
  const synced = (await d.slots.bulkGet([...new Set([id, ...ids])])).filter((m): m is SlotMeta => !!m?.sync).map((m) => m.id);
  await d.transaction('rw', d.slots, d.data, async () => {
    await d.slots.bulkDelete([...new Set([id, ...ids])]);
    await d.data.bulkDelete([...new Set([id, ...ids])]);
  });
  // The deleted slots that were in the cloud (they are deleted there at the next sync).
  return synced;
}

// The game that is open on this device, so it reopens after a reload.
const CURRENT_KEY = 'am.currentSlot';
export function currentSlotId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}
export function setCurrentSlotId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // Storage blocked: the game just won't reopen by itself.
  }
}

/** Asks the browser not to clear the saves when space runs low (granted silently for installed apps). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted } : null;
  } catch {
    return null;
  }
}

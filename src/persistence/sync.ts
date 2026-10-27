// Cloud sync (Phase 3): keeps the save slots of all the player's devices the same. Each slot remembers the cloud
// revision it was last synced with; comparing that with both sides tells what to do: upload what changed here,
// download what changed elsewhere, and ask the player when both changed (the other version is kept as a copy).
// The cloud itself is behind a small interface (Firebase in cloudFirebase.ts, a fake in the tests).
import { deleteSlot, listSlots, markSynced, newSlotId, readSlot, writeSlot, type SlotMeta } from './saves';

/** A slot as stored in the cloud: its list entry plus a revision number that grows with every upload. */
export interface CloudSlot extends Omit<SlotMeta, 'sync'> {
  rev: number;
  /** The device that uploaded it last. */
  device: string;
}

export interface CloudBackend {
  list(): Promise<CloudSlot[]>;
  download(id: string): Promise<Uint8Array | null>;
  /** Uploads if the cloud is still at `expectedRev` (0 = new slot). Returns the new revision, or null if another device was faster. */
  upload(meta: Omit<SlotMeta, 'sync'>, data: Uint8Array, expectedRev: number): Promise<number | null>;
  remove(id: string): Promise<void>;
}

export type SyncAction =
  | { kind: 'upload'; id: string; expectedRev: number }
  | { kind: 'download'; id: string }
  | { kind: 'removeCloud'; id: string }
  | { kind: 'removeLocal'; id: string }
  | { kind: 'conflict'; id: string };

/**
 * What to do for every slot. `deleted` = slots deleted on this device that may still be in the cloud.
 * Pure function, so the rules can be tested on their own.
 */
export function planSync(local: readonly SlotMeta[], cloud: readonly CloudSlot[], deleted: ReadonlySet<string>): SyncAction[] {
  const actions: SyncAction[] = [];
  const cloudById = new Map(cloud.map((c) => [c.id, c]));
  const localById = new Map(local.map((l) => [l.id, l]));
  for (const c of cloud) {
    if (deleted.has(c.id) && !localById.has(c.id)) actions.push({ kind: 'removeCloud', id: c.id });
  }
  for (const l of local) {
    const c = cloudById.get(l.id);
    const changedHere = !l.sync || l.savedAt > l.sync.savedAt;
    if (!c) {
      // Gone from the cloud: deleted on another device, unless it is new or changed here.
      actions.push(l.sync && !changedHere ? { kind: 'removeLocal', id: l.id } : { kind: 'upload', id: l.id, expectedRev: 0 });
      continue;
    }
    if (!l.sync) {
      // Both sides have it but it was never synced from here (e.g. the same import on two devices).
      actions.push(c.savedAt === l.savedAt ? { kind: 'download', id: l.id } : { kind: 'conflict', id: l.id });
      continue;
    }
    const changedThere = c.rev > l.sync.rev;
    if (changedHere && changedThere) actions.push({ kind: 'conflict', id: l.id });
    else if (changedHere) actions.push({ kind: 'upload', id: l.id, expectedRev: c.rev });
    else if (changedThere) actions.push({ kind: 'download', id: l.id });
  }
  for (const c of cloud) {
    if (!localById.has(c.id) && !deleted.has(c.id)) actions.push({ kind: 'download', id: c.id });
  }
  return actions;
}

export interface SyncConflict {
  id: string;
  local: SlotMeta;
  cloud: CloudSlot;
}

export interface SyncResult {
  /** Slots replaced or added from the cloud. */
  downloaded: string[];
  uploaded: string[];
  removedLocal: string[];
  conflicts: SyncConflict[];
}

const strip = ({ sync: _sync, ...meta }: SlotMeta): Omit<SlotMeta, 'sync'> => meta;
const fromCloud = ({ rev, device: _device, ...meta }: CloudSlot): SlotMeta => ({ ...meta, sync: { rev, savedAt: meta.savedAt } });

/** One sync run. `deleted` is updated: slots removed from the cloud are taken off the list. */
export async function runSync(backend: CloudBackend, deleted: Set<string>, skipDownload?: (id: string) => boolean): Promise<SyncResult> {
  const local = await listSlots();
  const cloud = await backend.list();
  const cloudById = new Map(cloud.map((c) => [c.id, c]));
  const result: SyncResult = { downloaded: [], uploaded: [], removedLocal: [], conflicts: [] };
  for (const action of planSync(local, cloud, deleted)) {
    const c = cloudById.get(action.id);
    switch (action.kind) {
      case 'upload': {
        const saved = await readSlot(action.id);
        if (!saved) break;
        const rev = await backend.upload(strip(saved.meta), saved.data, action.expectedRev);
        if (rev !== null) {
          await markSynced(action.id, { rev, savedAt: saved.meta.savedAt });
          result.uploaded.push(action.id);
        }
        break;
      }
      case 'download': {
        if (!c || skipDownload?.(action.id)) break;
        const data = await backend.download(action.id);
        if (!data) break;
        await writeSlot(fromCloud(c), data);
        result.downloaded.push(action.id);
        break;
      }
      case 'removeCloud':
        await backend.remove(action.id);
        deleted.delete(action.id);
        break;
      case 'removeLocal':
        await deleteSlot(action.id);
        result.removedLocal.push(action.id);
        break;
      case 'conflict': {
        const l = local.find((x) => x.id === action.id);
        if (l && c) result.conflicts.push({ id: action.id, local: l, cloud: c });
        break;
      }
    }
  }
  // Slots deleted here that the cloud never had: nothing left to do.
  for (const id of [...deleted]) if (!cloudById.has(id)) deleted.delete(id);
  return result;
}

/**
 * Settles a conflict. The kept version stays in the slot (and goes to the cloud); the other one is kept as a copy
 * named `otherName`, so nothing is lost.
 */
export async function resolveConflict(backend: CloudBackend, conflict: SyncConflict, keep: 'local' | 'cloud', otherName: string): Promise<void> {
  const copyMeta = (meta: Omit<SlotMeta, 'sync'>): SlotMeta => ({
    ...meta,
    id: newSlotId('copy'),
    kind: 'copy',
    gameId: meta.kind === 'copy' ? meta.gameId : meta.id,
    name: otherName,
  });
  const local = await readSlot(conflict.id);
  const cloudData = await backend.download(conflict.id);
  if (keep === 'local') {
    if (cloudData) {
      const { rev: _rev, device: _device, ...cloudMeta } = conflict.cloud;
      await writeSlot(copyMeta(cloudMeta), cloudData);
    }
    if (local) {
      const rev = await backend.upload(strip(local.meta), local.data, conflict.cloud.rev);
      if (rev !== null) await markSynced(conflict.id, { rev, savedAt: local.meta.savedAt });
    }
  } else {
    if (local) await writeSlot(copyMeta(strip(local.meta)), local.data);
    if (cloudData) await writeSlot(fromCloud(conflict.cloud), cloudData);
  }
}

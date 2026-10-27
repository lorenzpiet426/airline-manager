// Cloud sync for the screens (Phase 3): Google sign-in and automatic syncing of all save slots through Firebase.
// Syncs when the app starts (before the last game opens), when it goes to the background, when it comes back, and every
// few minutes while something changed. Firebase is only loaded when the build has a project configured.
import { useSyncExternalStore } from 'react';
import { FIREBASE_CONFIG } from '../persistence/firebaseConfig';
import type { CloudUser, FirebaseCloud } from '../persistence/cloudFirebase';
import { listSlots } from '../persistence/saves';
import { resolveConflict, runSync, type CloudBackend, type SyncConflict } from '../persistence/sync';
import { connectCloud, withAutosaveHeld } from './store';

export type CloudStatus = 'unavailable' | 'starting' | 'signedOut' | 'syncing' | 'synced' | 'error';

export interface CloudState {
  status: CloudStatus;
  user: CloudUser | null;
  /** Real time (ms) of the last successful sync. */
  lastSync: number | null;
  conflicts: SyncConflict[];
  error: string | null;
}

const PERIODIC_MS = 3 * 60_000;
/** The first start waits at most this long for the cloud (offline: go ahead with what's on the device). */
const BOOT_WAIT_MS = 6_000;
const DELETED_KEY = 'am.cloudDeleted';
const DEVICE_KEY = 'am.deviceId';

let state: CloudState = { status: FIREBASE_CONFIG ? 'starting' : 'unavailable', user: null, lastSync: null, conflicts: [], error: null };
const listeners = new Set<() => void>();
let cloud: FirebaseCloud | null = null;
let backend: CloudBackend | null = null;
let running: Promise<void> | null = null;
let again = false;

function set(patch: Partial<CloudState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function storage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function deviceId(): string {
  let id = storage<string | null>(DEVICE_KEY, null);
  if (!id) {
    id = `d-${Math.random().toString(36).slice(2, 10)}`;
    store(DEVICE_KEY, id);
  }
  return id;
}

/** Slots deleted on this device that still have to be deleted in the cloud. */
const deletedSet = () => new Set(storage<string[]>(DELETED_KEY, []));

/** Syncs now (or once more after the running sync). */
export function syncNow(): Promise<void> {
  if (!backend) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        set({ status: 'syncing', error: null });
        const deleted = deletedSet();
        let conflicts: SyncConflict[] = [];
        await withAutosaveHeld(async (openId) => {
          const result = await runSync(backend!, deleted);
          conflicts = result.conflicts;
          return !!openId && result.downloaded.includes(openId);
        });
        store(DELETED_KEY, [...deleted]);
        set({ status: 'synced', lastSync: Date.now(), conflicts });
      } while (again);
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Settles a conflict: keep this device's version or the cloud's; the other one becomes a copy named `otherName`. */
export async function resolve(conflict: SyncConflict, keep: 'local' | 'cloud', otherName: string): Promise<void> {
  if (!backend) return;
  await withAutosaveHeld(async (openId) => {
    await resolveConflict(backend!, conflict, keep, otherName);
    return keep === 'cloud' && openId === conflict.id;
  });
  set({ conflicts: state.conflicts.filter((c) => c.id !== conflict.id) });
  await syncNow();
}

export async function signIn(): Promise<void> {
  try {
    await cloud?.signIn();
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
  }
}

export async function signOutCloud(): Promise<void> {
  await cloud?.signOut();
}

/** Starts Firebase; resolves after the first sync of a signed-in player (or when signed out). */
function start(): Promise<void> {
  return new Promise<void>((done) => {
    void import('../persistence/cloudFirebase')
      .then(({ connectFirebase }) => {
        cloud = connectFirebase(FIREBASE_CONFIG!);
        let first = true;
        cloud.onUser((user) => {
          backend = user ? cloud!.backend(user.uid, deviceId()) : null;
          set({ user, status: user ? 'syncing' : 'signedOut', conflicts: [] });
          const synced = user ? syncNow() : Promise.resolve();
          if (first) {
            first = false;
            void synced.then(done);
          }
        });
      })
      .catch((e) => {
        set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
        done();
      });
  });
}

if (FIREBASE_CONFIG && typeof window !== 'undefined') {
  const ready = start();
  connectCloud({
    gate: Promise.race([ready, new Promise<void>((r) => setTimeout(r, BOOT_WAIT_MS))]),
    visibility: async (s) => {
      if (backend) await syncNow();
      void s;
    },
    deleted: (ids) => {
      store(DELETED_KEY, [...new Set([...deletedSet(), ...ids])]);
      void syncNow();
    },
  });
  // Every few minutes: sync if a save changed since the last sync (checked on the device, no cloud reads).
  setInterval(async () => {
    if (!backend || running) return;
    const slots = await listSlots().catch(() => []);
    if (slots.some((s) => !s.sync || s.savedAt > s.sync.savedAt) || deletedSet().size) void syncNow();
  }, PERIODIC_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCloud(): CloudState {
  return useSyncExternalStore(subscribe, () => state);
}

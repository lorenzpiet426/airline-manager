// Cloud sync backend on Firebase (free Spark plan): Google sign-in (Auth) and the saves in Firestore.
// Layout: users/{uid}/slots/{slotId} = list entry + revision; users/{uid}/slots/{slotId}/chunks/{n} = the compressed
// save in pieces (a Firestore document holds at most 1 MiB). Only loaded when cloud sync is used.
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { Bytes, collection, doc, getDoc, getDocs, getFirestore, runTransaction, writeBatch, type Firestore } from 'firebase/firestore';
import type { SlotMeta } from './saves';
import type { CloudBackend, CloudSlot } from './sync';

const CHUNK_BYTES = 700_000;

export interface CloudUser {
  uid: string;
  email: string | null;
  name: string | null;
}

export interface FirebaseCloud {
  onUser(callback: (user: CloudUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  backend(uid: string, device: string): CloudBackend;
}

export function connectFirebase(config: FirebaseOptions): FirebaseCloud {
  const app = initializeApp(config);
  const auth: Auth = getAuth(app);
  const db: Firestore = getFirestore(app);
  const toUser = (u: User): CloudUser => ({ uid: u.uid, email: u.email, name: u.displayName });

  return {
    onUser: (callback) => onAuthStateChanged(auth, (u) => callback(u ? toUser(u) : null)),
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Some installed apps can't open pop-ups: sign in on a full page instead.
        if ((e as { code?: string }).code === 'auth/popup-blocked' || (e as { code?: string }).code === 'auth/operation-not-supported-in-this-environment') {
          await signInWithRedirect(auth, provider);
        } else throw e;
      }
    },
    signOut: () => signOut(auth),
    backend: (uid, device) => firestoreBackend(db, uid, device),
  };
}

function firestoreBackend(db: Firestore, uid: string, device: string): CloudBackend {
  const slots = collection(db, 'users', uid, 'slots');
  const chunks = (id: string) => collection(db, 'users', uid, 'slots', id, 'chunks');
  const chunkName = (n: number) => String(n).padStart(4, '0');

  return {
    async list() {
      const snap = await getDocs(slots);
      return snap.docs.map((d) => {
        const { chunks: _chunks, updatedAt: _updatedAt, ...meta } = d.data() as CloudSlot & { chunks: number; updatedAt: number };
        return meta;
      });
    },

    async download(id) {
      const meta = await getDoc(doc(slots, id));
      if (!meta.exists()) return null;
      const count = (meta.data() as { chunks: number }).chunks;
      const snap = await getDocs(chunks(id));
      const parts = snap.docs
        .filter((d) => Number(d.id) < count)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((d) => (d.data() as { data: Bytes }).data.toUint8Array());
      if (parts.length !== count) return null;
      const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.byteLength;
      }
      return out;
    },

    async upload(meta: Omit<SlotMeta, 'sync'>, data, expectedRev) {
      const count = Math.max(1, Math.ceil(data.byteLength / CHUNK_BYTES));
      return runTransaction(db, async (tx) => {
        const ref = doc(slots, meta.id);
        const current = await tx.get(ref);
        const old = current.exists() ? (current.data() as { rev: number; chunks: number }) : null;
        if ((old?.rev ?? 0) !== expectedRev) return null;
        const rev = expectedRev + 1;
        for (let n = 0; n < count; n++) {
          tx.set(doc(chunks(meta.id), chunkName(n)), { data: Bytes.fromUint8Array(data.subarray(n * CHUNK_BYTES, (n + 1) * CHUNK_BYTES)) });
        }
        for (let n = count; n < (old?.chunks ?? 0); n++) tx.delete(doc(chunks(meta.id), chunkName(n)));
        tx.set(ref, { ...meta, rev, device, chunks: count, updatedAt: Date.now() });
        return rev;
      });
    },

    async remove(id) {
      const snap = await getDocs(chunks(id));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(slots, id));
      await batch.commit();
    },
  };
}

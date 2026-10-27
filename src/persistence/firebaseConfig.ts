// The Firebase project for cloud sync (Phase 3). These values are public by design: they only name the project;
// what each player may read and write is decided by the security rules in firestore.rules (only their own saves).
// null = cloud sync is not set up in this build.
import type { FirebaseOptions } from 'firebase/app';

export const FIREBASE_CONFIG: FirebaseOptions | null = null;

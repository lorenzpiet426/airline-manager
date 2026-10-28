// The Firebase project for cloud sync (Phase 3). These values are public by design: they only name the project;
// what each player may read and write is decided by the security rules in firestore.rules (only their own saves).
// null = cloud sync is not set up in this build.
import type { FirebaseOptions } from 'firebase/app';

export const FIREBASE_CONFIG: FirebaseOptions | null = {
  apiKey: 'AIzaSyCszod1fFbvIX71B4WgrWOIUNxvfRNz-Sw',
  authDomain: 'airline-manager-a45e8.firebaseapp.com',
  projectId: 'airline-manager-a45e8',
  storageBucket: 'airline-manager-a45e8.firebasestorage.app',
  messagingSenderId: '1089697314852',
  appId: '1:1089697314852:web:113a712b9a2a66ee8680b1',
};

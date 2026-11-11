import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase web config. These values are public by design (they identify the
 * project, they don't grant access); access is controlled by firestore.rules.
 * Set them in .env.local for development and in Vercel project settings for production.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/** Local development against `npm run emulators` instead of the real project. */
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

let emulatorsConnected = false;

function app(): FirebaseApp {
  if (getApps().length) return getApp();
  const created = initializeApp(firebaseConfig);
  if (useEmulators && !emulatorsConnected) {
    emulatorsConnected = true;
    connectAuthEmulator(getAuth(created), "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(created), "127.0.0.1", 8080);
  }
  return created;
}

/** Created lazily, in the browser only, so pre-rendering never touches Firebase. */
export function firebaseAuth(): Auth {
  return getAuth(app());
}

export function db(): Firestore {
  return getFirestore(app());
}

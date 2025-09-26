// Firebase client initialization for the Astro app
// Uses PUBLIC_ env vars so they are exposed to the browser as per Astro conventions.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  databaseURL: import.meta.env.PUBLIC_FIREBASE_DATABASE_URL,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
  // Optional, add if you configure them
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

// Initialize only once in the browser
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
// Keep the user signed in across reloads (no-op on server)
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
} catch {}
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
// Explicit region to match deployed Cloud Functions
export const functions = getFunctions(firebaseApp, 'us-central1');

// Initialize App Check when a site key is provided (required if App Check is enforced for Storage)
try {
  if (typeof window !== 'undefined') {
    const siteKey = (import.meta as any).env?.PUBLIC_RECAPTCHA_V3_SITE_KEY as string | undefined;
    if (siteKey && siteKey.length > 0) {
      initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
} catch {}


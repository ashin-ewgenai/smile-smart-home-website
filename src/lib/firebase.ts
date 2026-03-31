// Firebase client initialization for the Astro app
// Uses PUBLIC_ env vars so they are exposed to the browser as per Astro conventions.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAabRQ7qLfA252KzafCLYhb5yO43jrJ1Nw",
  authDomain: "smile-smart-homes.firebaseapp.com",
  databaseURL: "https://smile-smart-homes-default-rtdb.firebaseio.com",
  projectId: "smile-smart-homes",
  storageBucket: "smile-smart-homes.firebasestorage.app",
  messagingSenderId: "963327038910",
  appId: "1:963327038910:web:ea9be712f31d0f4d4895ef",
  measurementId: "G-4TFERPBXFT"
};

// Initialize only once in the browser
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
// Keep the user signed in across reloads (no-op on server)
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
} catch {}
// Use initializeFirestore with long-polling to avoid QUIC/HTTP3 transport issues on constrained networks
export const db = initializeFirestore(firebaseApp, {
  experimentalAutoDetectLongPolling: true,
});
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

/**
 * uploadReviewMedia
 * Uploads a file to Firebase Storage under user_uploads/{uid}/reviews/
 * Returns the public download URL.
 */
export async function uploadReviewMedia(file: File, uid: string): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const storagePath = `user_uploads/${uid}/reviews/${timestamp}_${safeName}`;
  const storageRef = ref(storage, storagePath);
  
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}


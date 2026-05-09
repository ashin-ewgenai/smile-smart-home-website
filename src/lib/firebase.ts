// Firebase client initialization for the Astro app
// Uses PUBLIC_ env vars so they are exposed to the browser as per Astro conventions.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

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

// Enable persistence for instant data on reload
if (typeof window !== 'undefined') {
  import('firebase/firestore').then(({ enableIndexedDbPersistence }) => {
    enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence failed: Multiple tabs open');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence failed: Browser not supported');
      }
    });
  });
}
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
 * uploadFile
 * Generic, secure utility to upload a file to Firebase Storage.
 * Handles validation, unique path generation, and progress tracking.
 */
export async function uploadFile(
  file: File,
  basePath: string,
  options: {
    allowedTypes?: string[];
    maxSizeMB?: number;
    onProgress?: (percent: number) => void;
  } = {}
): Promise<string> {
  const {
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeMB = 10,
    onProgress
  } = options;

  // 1. Validation: Type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    throw new Error(`File type '${file.type}' is not supported. Allowed: ${allowedTypes.join(', ')}`);
  }

  // 2. Validation: Size
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max allowed is ${maxSizeMB}MB.`);
  }

  // 3. Prepare Path
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
  const storagePath = `${basePath.endsWith('/') ? basePath : basePath + '/'}${timestamp}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  // 4. Upload with Resumable support for progress
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(percent);
      },
      (error) => {
        console.error('Upload failed:', error);
        reject(new Error(`Upload failed: ${error.message}`));
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(url);
        } catch (err: any) {
          reject(new Error(`Failed to get download URL: ${err.message}`));
        }
      }
    );
  });
}

/**
 * uploadReviewMedia
 * Uploads review media securely.
 */
export async function uploadReviewMedia(file: File, uid: string): Promise<string> {
  return uploadFile(file, `user_uploads/${uid}/reviews`);
}

/**
 * uploadRoomPhoto
 * Uploads a room photo securely with progress support.
 */
export async function uploadRoomPhoto(
  file: File,
  uid: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return uploadFile(file, `user_uploads/${uid}/room_photos`, { onProgress });
}

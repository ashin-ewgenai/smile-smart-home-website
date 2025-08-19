import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

let app: App;

function getPrivateKey(): string | undefined {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  // Support keys provided with escaped newlines
  return key.replace(/\\n/g, '\n');
}

export const initFirebase = () => {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = getPrivateKey();
    const databaseURL = process.env.FIREBASE_DB_URL;

    if (!projectId || !clientEmail || !privateKey || !databaseURL) {
      throw new Error(
        'Missing Firebase Admin env vars. Required: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DB_URL'
      );
    }

    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      databaseURL,
    });
  }
  return app!;
};

initFirebase();

export const db = getDatabase();

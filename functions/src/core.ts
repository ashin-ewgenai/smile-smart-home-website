import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { defineSecret } from "firebase-functions/params";

// Ensure Firebase Admin is initialized exactly once per instance
if (!getApps().length) {
  initializeApp();
}

/** Central Firestore instance */
export const db = getFirestore();

/** Central Auth instance */
export const auth = getAuth();

/** Shared Secret for OpenAI queries */
export const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

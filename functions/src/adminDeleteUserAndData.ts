import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Ensure Admin SDK is initialized (in case this module is imported before index.ts runs)
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const adminAuth = getAuth();

// No role enforcement needed in this app context

function makeBatch() {
  let batch: FirebaseFirestore.WriteBatch = db.batch();
  let count = 0;
  const flush = async () => {
    if (count > 0) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  };
  return {
    delete: async (ref: FirebaseFirestore.DocumentReference) => {
      if (count >= 450) await flush();
      batch.delete(ref);
      count++;
    },
    done: async () => flush(),
  };
}

async function deleteByQuery(collectionName: string, field: string, uid: string): Promise<number> {
  const qs = await db.collection(collectionName).where(field, "==", uid).get();
  if (qs.empty) return 0;
  const batcher = makeBatch();
  for (const d of qs.docs) await batcher.delete(d.ref);
  await batcher.done();
  return qs.size;
}

export const adminDeleteUserAndData = onCall({ region: "us-central1", cors: true }, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");

  const targetUid = request.data?.uid as string | undefined;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }
  if (authCtx.uid === targetUid) {
    throw new HttpsError("failed-precondition", "You cannot delete your own account.");
  }

  const targetAccountRef = db.collection("Accounts").doc(targetUid);

  const summary: Record<string, number> = {};

  try {
    // 1) Flat collections by uid
    for (const [name, field] of [
      ["Request_service", "uid"],
      ["Support_Tickets", "uid"],
      ["User_Devices", "uid"],
    ] as const) {
      summary[name] = await deleteByQuery(name, field, targetUid);
    }

    // 2) quotes (flat) by uid only
    summary.quotes = await deleteByQuery("quotes", "uid", targetUid);

    // 3) Estimation Quote (flat) by uid only
    summary.estimation_quote = await deleteByQuery("Estimation Quote", "uid", targetUid);

    // 4) chat_sessions where ownerUid == targetUid (delete session docs only)
    summary.chat_sessions = await deleteByQuery("chat_sessions", "ownerUid", targetUid);

    // 5) Delete the Accounts doc last (if exists)
    try {
      await targetAccountRef.delete();
      summary.account_doc = 1;
    } catch {
      summary.account_doc = 0;
    }

    // 6) Delete from Firebase Authentication (ignore user-not-found)
    try {
      await adminAuth.deleteUser(targetUid);
      summary.auth_user = 1;
    } catch (e: any) {
      // If already missing, don't fail entire operation
      const code = e?.code || e?.errorInfo?.code || "";
      if (String(code).includes("auth/user-not-found")) {
        summary.auth_user = 0;
      } else {
        throw e;
      }
    }

    return { status: "ok", summary };
  } catch (e: any) {
    const message = e?.message || String(e);
    throw new HttpsError("internal", `Failed to delete user data: ${message}`);
  }
});

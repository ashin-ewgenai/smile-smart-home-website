import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Ensure Admin SDK is initialized (in case this module is imported before index.ts runs)
if (!getApps().length) {
  initializeApp();
}

async function deleteFromSpecificBucketIfExists(bucketName: string, path: string): Promise<number> {
  try {
    const b = getStorage().bucket(bucketName);
    const file = b.file(path);
    const [exists] = await file.exists();
    if (!exists) return 0;
    await file.delete().catch(() => {});
    return 1;
  } catch {
    return 0;
  }
}

// Extract bucket and path from a Firebase Storage URL (gs:// or https download URL)
function parseStorageUrl(url: string): { bucket?: string; path?: string } {
  try {
    if (url.startsWith('gs://')) {
      // gs://bucket/path/to/file
      const without = url.replace('gs://', '');
      const firstSlash = without.indexOf('/');
      if (firstSlash === -1) return {};
      const bucket = without.slice(0, firstSlash);
      const path = without.slice(firstSlash + 1);
      return { bucket, path };
    }
    if (url.startsWith('http')) {
      // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?...
      const bIdx = url.indexOf('/b/');
      const oIdx = url.indexOf('/o/');
      if (bIdx !== -1 && oIdx !== -1) {
        const bucketStart = bIdx + 3;
        const bucketEnd = url.indexOf('/', bucketStart);
        const bucket = url.slice(bucketStart, bucketEnd);
        const pathStart = oIdx + 3;
        const queryIdx = url.indexOf('?', pathStart);
        const encoded = queryIdx === -1 ? url.slice(pathStart) : url.slice(pathStart, queryIdx);
        const path = decodeURIComponent(encoded);
        return { bucket, path };
      }
    }
  } catch {}
  return {};
}

const db = getFirestore();
const adminAuth = getAuth();
// Do NOT initialize a Storage bucket at module load; projects without a default bucket will crash here.
// Access Storage lazily inside helper functions with try/catch.

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

// Storage cleanup helpers
async function deleteStoragePrefix(prefix: string): Promise<number> {
  try {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix });
    if (!files.length) return 0;
    await Promise.all(files.map(f => f.delete().catch(() => {})));
    return files.length;
  } catch {
    return 0;
  }
}

// Note: Previously had a deleteStorageFileIfExists helper here, but it became unused
// after switching to URL-based deletion and prefix cleanup. Removed to satisfy linter.

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

  const summary: Record<string, any> = {};
  let bucketName = 'unknown';
  try { bucketName = getStorage().bucket().name; } catch {}
  console.log('[adminDeleteUserAndData] Using bucket:', bucketName);

  try {
    // 1) Flat collections by uid
    for (const [name, field] of [
      ["Request_service", "uid"],
      ["Support_Tickets", "uid"],
      ["User_Devices", "uid"],
      ["Planner_Leads", "uid"],
      ["contactRequests", "uid"],
    ] as const) {
      summary[name] = await deleteByQuery(name, field, targetUid);
    }

    // 2) quotes (flat) by uid or userUid (handle both field names)
    const quotesByUid = await deleteByQuery("quotes", "uid", targetUid);
    const quotesByUserUid = await deleteByQuery("quotes", "userUid", targetUid);
    summary.quotes = quotesByUid + quotesByUserUid;

    // 3) Estimation_Quote (flat) by uid only
    // Prepare estimation quotes for this user (we will delete attachments first, then docs)
    const estSnap = await db.collection("Estimation_Quote").where("uid", "==", targetUid).get();
    const estDocs = estSnap.docs;

    // 4) chat_sessions where ownerUid == targetUid (delete messages subcollection then session docs)
    const sessionsSnap = await db.collection("chat_sessions").where("ownerUid", "==", targetUid).get();
    let deletedSessions = 0;
    for (const sessionDoc of sessionsSnap.docs) {
      // Delete messages subcollection first
      const msgsCol = db.collection("chat_sessions").doc(sessionDoc.id).collection("messages");
      const msgsSnap = await msgsCol.get();
      const batcher = makeBatch();
      for (const m of msgsSnap.docs) await batcher.delete(m.ref);
      await batcher.done();
      // Then delete the session document
      await sessionDoc.ref.delete();
      deletedSessions++;
    }
    summary.chat_sessions = deletedSessions;

    // 5) Delete user notifications (optional cleanup)
    summary.user_notifications = await deleteByQuery("User_Notifications", "uid", targetUid);
    
    // Also delete admin notifications related to this user
    summary.admin_notifications = await deleteByQuery("Admin_Notifications", "customerUid", targetUid);

    // 6) Storage cleanup - delete user-owned files
    const storageSummary: Record<string, number> = {};
    // Try to delete the exact profilePic from its stored URL (handles custom buckets)
    try {
      const targetSnap = await targetAccountRef.get();
      const profilePicUrl = targetSnap.exists ? (targetSnap.data() as any)?.profilePic : undefined;
      if (typeof profilePicUrl === 'string' && profilePicUrl.length > 0) {
        const parsed = parseStorageUrl(profilePicUrl);
        if (parsed.bucket && parsed.path) {
          storageSummary.profile_url = await deleteFromSpecificBucketIfExists(parsed.bucket, parsed.path);
        }
      }
    } catch {}
    // Also delete any profile image regardless of extension (default bucket)
    storageSummary.profile_any = await deleteStoragePrefix(`profile/${targetUid}.`);
    storageSummary.supportTickets = await deleteStoragePrefix(`supportTickets/${targetUid}/`);
    storageSummary.support_chat = await deleteStoragePrefix(`support_chat/${targetUid}/`);

    // Delete estimation attachments linked to this user's estimation quotes
    try {
      let attachDeletedCount = 0;
      for (const d of estDocs) {
        const data = d.data() as any;
        const attachments: string[] = Array.isArray(data?.attachments) ? data.attachments : [];
        // Delete by exact URL (supports custom buckets)
        for (const url of attachments) {
          try {
            const parsed = parseStorageUrl(String(url));
            if (parsed.bucket && parsed.path) {
              attachDeletedCount += await deleteFromSpecificBucketIfExists(parsed.bucket, parsed.path);
            }
          } catch {}
        }
        // Also delete any remaining files by prefix in default bucket using estimationId/doc id
        try {
          attachDeletedCount += await deleteStoragePrefix(`estimation_attachments/${d.id}/`);
        } catch {}
      }
      storageSummary.estimation_attachments = attachDeletedCount;
    } catch {}
    summary.storage = storageSummary;

    // 7) Delete Estimation_Quote docs after attachment cleanup
    try {
      if (estDocs.length) {
        const batcher = makeBatch();
        for (const d of estDocs) await batcher.delete(d.ref);
        await batcher.done();
        summary.estimation_quote = estDocs.length;
      } else {
        summary.estimation_quote = 0;
      }
    } catch {
      // If deletion of docs fails, set count to 0 to reflect none deleted
      summary.estimation_quote = 0;
    }

    // 8) Delete the Accounts doc last (if exists)
    try {
      await targetAccountRef.delete();
      summary.account_doc = 1;
    } catch {
      summary.account_doc = 0;
    }

    // 9) Delete from Firebase Authentication (ignore user-not-found)
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

    console.log('[adminDeleteUserAndData] Completed deletion', { uid: targetUid, bucketName, summary });
    return { status: "ok", summary };
  } catch (e: any) {
    const message = e?.message || String(e);
    throw new HttpsError("internal", `Failed to delete user data: ${message}`);
  }
});

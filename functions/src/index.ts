import {onCall, HttpsError} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {initializeApp, getApps} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

// Configure global options (tune as needed)
setGlobalOptions({maxInstances: 10});

// Initialize Admin SDK once
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const adminAuth = getAuth();

// Callable function to delete both Auth user and Firestore user doc
export const superAdminDeleteUser = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const callerUid = authCtx.uid;
  const targetUid = request.data?.uid as string | undefined;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }
  if (callerUid === targetUid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot delete your own account."
    );
  }

  // Verify caller is Super Admin
  const callerSnap = await db.collection("users").doc(callerUid).get();
  const callerRole = callerSnap.exists ?
    (callerSnap.data()?.role as string) :
    undefined;
  if (callerRole !== "Super Admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Super Admin can perform this action."
    );
  }

  // Block deleting Super Admins
  const targetRef = db.collection("users").doc(targetUid);
  const targetSnap = await targetRef.get();
  const targetRole = targetSnap.exists ?
    (targetSnap.data()?.role as string) :
    undefined;
  if (targetRole === "Super Admin") {
    throw new HttpsError(
      "failed-precondition",
      "Cannot delete a Super Admin account."
    );
  }

  try {
    // Delete from Firebase Authentication (ignore user-not-found)
    try {
      await adminAuth.deleteUser(targetUid);
    } catch (e) {
      const err = e as {code?: string; errorInfo?: {code?: string}};
      const code = err?.code || err?.errorInfo?.code || "";
      if (!String(code).includes("auth/user-not-found")) {
        throw err;
      }
    }
    // Delete Firestore user document
    await targetRef.delete();
    return {status: "ok"};
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "Delete failed");
  }
});

// Helper to ensure caller is Super Admin
async function assertSuperAdmin(callerUid: string) {
  const snap = await db.collection("users").doc(callerUid).get();
  const role = snap.exists ? (snap.data()?.role as string) : undefined;
  if (role !== "Super Admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Super Admin can perform this action."
    );
  }
}

// Callable: Get a single user's Auth record and Firestore doc by UID
export const superAdminGetUser = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const uid = request.data?.uid as string | undefined;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }

  await assertSuperAdmin(authCtx.uid);

  try {
    // Auth user (null if not found)
    let authUser: unknown = null;
    try {
      const rec = await adminAuth.getUser(uid);
      authUser = {
        uid: rec.uid,
        email: rec.email ?? null,
        phoneNumber: rec.phoneNumber ?? null,
        displayName: rec.displayName ?? null,
        disabled: rec.disabled,
        emailVerified: rec.emailVerified,
        providerData: rec.providerData?.map((p) => ({
          providerId: p.providerId,
          uid: p.uid,
          email: p.email ?? null,
          displayName: p.displayName ?? null,
          phoneNumber: p.phoneNumber ?? null,
          photoURL: p.photoURL ?? null,
        })) ?? [],
        customClaims: rec.customClaims ?? {},
        metadata: {
          creationTime: rec.metadata.creationTime ?? null,
          lastSignInTime: rec.metadata.lastSignInTime ?? null,
        },
      };
    } catch (e) {
      const err = e as {code?: string};
      if (err?.code !== "auth/user-not-found") throw e;
    }

    // Firestore user doc (null if not found)
    const userDocSnap = await db.collection("users").doc(uid).get();
    const fsUser = userDocSnap.exists ? { id: userDocSnap.id, ...userDocSnap.data() } : null;

    return { authUser, fsUser };
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "Fetch failed");
  }
});

// Callable: List user IDs from Firebase Auth (paginated) and Firestore
// request.data: { pageToken?: string, maxResults?: number }
export const superAdminListUserIds = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  await assertSuperAdmin(authCtx.uid);

  const pageToken = request.data?.pageToken as string | undefined;
  const maxResultsRaw = request.data?.maxResults as number | undefined;
  const maxResults = Math.min(Math.max(maxResultsRaw ?? 100, 1), 1000);

  try {
    // Auth IDs (paginated)
    const listRes = await adminAuth.listUsers(maxResults, pageToken);
    const authIds = listRes.users.map((u) => u.uid);

    // Firestore IDs (all in collection) — keep light by not returning entire docs
    const fsSnap = await db.collection("users").select().get();
    const fsIds = fsSnap.docs.map((d) => d.id);

    return {
      auth: { ids: authIds, nextPageToken: listRes.pageToken || null },
      firestore: { ids: fsIds },
    };
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "List failed");
  }
});

// Callable: Update a user's Auth record (email/displayName) and Firestore doc
// request.data: { uid: string, email?: string, displayName?: string }
export const superAdminUpdateUser = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const uid = request.data?.uid as string | undefined;
  const email = request.data?.email as string | undefined;
  const displayName = request.data?.displayName as string | undefined;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }

  await assertSuperAdmin(authCtx.uid);

  try {
    // Load target to check role (to avoid modifying Super Admin accounts silently)
    const targetRef = db.collection("users").doc(uid);
    const targetSnap = await targetRef.get();
    const targetRole = targetSnap.exists ? (targetSnap.data()?.role as string | undefined) : undefined;
    if (targetRole === "Super Admin") {
      throw new HttpsError("failed-precondition", "Cannot modify Super Admin via this endpoint.");
    }

    // Build update payload for Auth
    const update: { email?: string; displayName?: string } = {};
    if (typeof email === "string" && email.trim()) update.email = email.trim();
    if (typeof displayName === "string") update.displayName = displayName || null as unknown as string; // allow empty to clear

    if (Object.keys(update).length > 0) {
      await adminAuth.updateUser(uid, update);
    }

    // Sync Firestore fields to keep consistent
    const fsUpdate: Record<string, unknown> = {};
    if (typeof email === "string" && email.trim()) fsUpdate.email = email.trim();
    if (typeof displayName === "string") {
      fsUpdate.displayName = displayName || "";
      fsUpdate.name = displayName || ""; // keep `name` in sync for UI greeting
    }
    if (Object.keys(fsUpdate).length > 0) {
      await targetRef.set(fsUpdate, { merge: true });
    }

    return { status: "ok" };
  } catch (e) {
    const err = e as { message?: string; code?: string };
    // Map common Auth errors to https error
    if ((err.code || "").includes("auth/")) {
      throw new HttpsError("failed-precondition", err.message || "Auth update failed");
    }
    throw new HttpsError("internal", err?.message || "Update failed");
  }
});


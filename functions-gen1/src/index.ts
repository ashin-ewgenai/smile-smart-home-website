/**
 * Scheduled function: scan user devices and create an unread 'warranty' notification
 * in User_Notifications for any user who has at least one expired warranty.
 *
 * Runs daily; idempotent per user via deterministic ID 'warranty_<uid>'.
 */
import * as functions from "firebase-functions/v1";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Initialize Admin SDK once per environment
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

export const checkExpiredWarranties = functions.pubsub
  .schedule("every 24 hours")
  .timeZone("UTC")
  .onRun(async () => {
    const nowMs = Date.now();
    try {
      const userDevicesSnap = await db.collection("User_Devices").select("uid", "warrantyExpiry", "warrantyEnd", "serials").get();
      const expiredUids = new Set<string>();
      userDevicesSnap.forEach((d) => {
        try {
          const data: any = d.data() || {};
          const uid: string | undefined = data.uid;
          if (!uid) return;
          const candidates: any[] = [];
          if (data.warrantyExpiry != null) candidates.push(data.warrantyExpiry);
          if (data.warrantyEnd != null) candidates.push(data.warrantyEnd);
          if (Array.isArray(data.serials)) {
            for (const s of data.serials) {
              const v = s?.warrantyExpiry ?? s?.expiryDate ?? s?.warrantyEnd;
              if (v != null) candidates.push(v);
            }
          }
          for (const v of candidates) {
            let t = NaN;
            if (v && typeof v === "object" && typeof v.toDate === "function") t = v.toDate().getTime();
            else if (typeof v === "number") t = v < 1e12 ? v * 1000 : v;
            else if (typeof v === "string") t = Date.parse(v);
            if (!Number.isNaN(t) && t <= nowMs) { expiredUids.add(uid); break; }
          }
        } catch {}
      });
      for (const uid of expiredUids) {
        try {
          const q = await db.collection("User_Notifications")
            .where("uid", "==", uid)
            .where("type", "==", "warranty")
            .where("status", "==", "unread")
            .limit(1)
            .get();
          if (!q.empty) continue;
          const notifId = `warranty_${uid}`;
          await db.collection("User_Notifications").doc(notifId).set({
            uid,
            title: "Warranty Expired",
            message: "One or more device warranties have expired. Please review your devices.",
            type: "warranty",
            status: "unread",
            createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch {}
      }
    } catch {}
    return null;
  });

/**
 * Gen 1 Firestore trigger: When a new contact request is created, create an admin notification.
 * Path: contactRequests/{docId}
 */
export const onContactRequestCreated = functions.firestore
  .document("contactRequests/{docId}")
  .onCreate(async (snap) => {
    const data = snap.data() as {
      fullName?: string;
      email?: string;
      service?: string | null;
    };

    const docId = snap.id;
    const name = (data.fullName || "").toString().trim() || "Unknown";
    const email = (data.email || "").toString().trim().toLowerCase();
    const service = (data.service || "").toString().trim();

    const title = "New Contact Message";
    const message = `From ${name}${email ? ` (${email})` : ""}${service ? ` • Service: ${service}` : ""}`;

    await db.collection("Admin_Notifications").add({
      title,
      message,
      type: "contact_request",
      status: "unread",
      createdAt: FieldValue.serverTimestamp(),
      priority: "medium",
      customerEmail: email || null,
      relatedEntityId: docId,
      relatedEntityType: "contact_request",
    });

/**
 * Gen 1 Firestore trigger: When a new service request is created by a user,
 * create an admin notification so admins are alerted in real-time.
 * Path: Request_service/{requestId}
 */

    // Cleanup: backfill any prior contact notifications with incorrect type
    try {
      const snap = await db
        .collection("Admin_Notifications")
        .where("relatedEntityId", "==", docId)
        .where("relatedEntityType", "==", "contact_request")
        .where("type", "==", "support_ticket")
        .get();
      const batch = db.batch();
      snap.forEach((d) => batch.update(d.ref, { type: "contact_request" }));
      if (!snap.empty) await batch.commit();
    } catch {}
  });

/**
 * Gen 1 Firestore trigger: When a new service request is created by a user,
 * create an admin notification so admins are alerted in real-time.
 * Path: Request_service/{requestId}
 */
export const onRequestServiceCreated = functions.firestore
  .document("Request_service/{requestId}")
  .onCreate(async (snap, context) => {
    try {
      const req = (snap.data() || {}) as Record<string, any>;
      const requestId = snap.id;

      const uid = (req.uid || "").toString();
      const service = (req.service || "").toString();
      const devices: any[] = Array.isArray(req.devices) ? req.devices : [];
      const date = (req.date || "").toString();
      const time = (req.time || "").toString();
      const priorityRaw = (req.priority || "normal").toString().toLowerCase();
      const priority: "high" | "medium" | "low" =
        priorityRaw === "high" ? "high" : priorityRaw === "low" ? "low" : "medium";

      // Attempt to resolve customer email from Accounts/{uid}
      let email: string | null = null;
      if (uid) {
        try {
          const acc = await db.collection("Accounts").doc(uid).get();
          email = ((acc.data() as any)?.Email || null) ? String((acc.data() as any).Email) : null;
        } catch {}
      }

      const title = "New Service Request";
      const message = `${email || "A user"} submitted a ${service || "service"} request (${devices.length} device${devices.length === 1 ? "" : "s"})${
        date || time ? ` for ${[date, time].filter(Boolean).join(" ")}` : ""
      }.`.trim();

      await db.collection("Admin_Notifications").add({
        title,
        message,
        type: "service_request",
        status: "unread",
        createdAt: FieldValue.serverTimestamp(),
        relatedEntityId: requestId,
        relatedEntityType: "service_request",
        customerEmail: email,
        customerUid: uid || null,
        priority,
      });
    } catch (e) {
      // Best-effort notify; swallow to avoid retry storms
      return null;
    }
    return null;
  });

/**
 * Gen 1 Firestore onWrite trigger with role-based access guard.
 * Path: secureData/{docId}
 *
 * Requirements implemented:
 * - Triggers on create, update, and delete.
 * - Checks Firebase Auth custom claim role = 'admin' | 'user'.
 * - Falls back to Accounts/{uid}.Role when custom claim missing (per project pattern).
 * - Admins: allow all operations.
 * - Regular users: allow create/update only if ownerId matches their uid; deny deletes.
 * - Unauthenticated: deny all operations.
 * - On violation: attempt to rollback the write and throw HttpsError with a clear message.
 *
 * Notes:
 * Firestore triggers run AFTER the write has occurred. To approximate pre-authorization,
 * this function performs a compensating write (rollback) when a violation is detected and then
 * throws an HttpsError. A lightweight re-entrancy guard using the `__cfRollback` marker prevents
 * infinite loops from compensating writes.
 */
export const onSecureDataWrite = functions.firestore
  .document("secureData/{docId}")
  .onWrite(async (change, context) => {
    // Re-entrancy guard: if this write was produced by our rollback, skip checks
    try {
      if ((change.after.exists && (change.after.get("__cfRollback") === true)) ||
          (change.before.exists && (change.before.get("__cfRollback") === true))) {
        return null;
      }
    } catch {}

    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    const action: "create" | "update" | "delete" = !beforeExists && afterExists
      ? "create"
      : beforeExists && afterExists
      ? "update"
      : "delete";

    // Authentication required
    const auth = context.auth;
    if (!auth) {
      await rollbackOnViolation(change, action);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Permission denied: not authenticated"
      );
    }

    const uid = auth.uid;
    const token = (auth.token || {}) as Record<string, any>;
    const claimRole = (token.role || token.Role || "").toString().toLowerCase();

    // Determine admin via custom claim first; fallback to Accounts/{uid}.Role
    let isAdmin = claimRole === "admin";
    if (!isAdmin) {
      try {
        const accSnap = await db.collection("Accounts").doc(uid).get();
        const role = ((accSnap.data() as any)?.Role || "").toString().toLowerCase();
        if (role === "admin" || role === "super admin") {
          isAdmin = true;
        }
      } catch {}
    }

    if (isAdmin) {
      // Admins may perform any operation
      return null;
    }

    // Regular user checks
    const docData = action === "delete" ? change.before.data() : change.after.data();
    const ownerId = (docData?.ownerId || docData?.ownerID || docData?.uid || "").toString();
    const isOwner = ownerId && ownerId === uid;

    if (claimRole !== "admin" && claimRole !== "user") {
      // Unknown or missing role in claims; treat as regular user (must be owner for create/update; delete forbidden)
    }

    // Enforce rules for regular users
    if (action === "delete") {
      // Regular users cannot delete
      await rollbackOnViolation(change, action);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Permission denied: delete not allowed for regular users"
      );
    }

    if (!isOwner) {
      await rollbackOnViolation(change, action);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Permission denied: not an admin or owner"
      );
    }

    // Owner performing create/update is allowed
    return null;
  });

/**
 * Attempt to reverse the write when a violation is detected.
 * Adds a `__cfRollback: true` flag to prevent re-trigger loops.
 */
async function rollbackOnViolation(
  change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  action: "create" | "update" | "delete"
) {
  try {
    if (action === "create") {
      // Delete the newly created document
      if (change.after.exists) {
        await change.after.ref.delete();
      }
    } else if (action === "update") {
      // Restore previous state
      const prev = change.before.data();
      if (prev) {
        await change.after.ref.set({ ...prev, __cfRollback: true }, { merge: false });
      }
    } else if (action === "delete") {
      // Recreate the deleted document
      const prev = change.before.data();
      if (prev) {
        await change.before.ref.set({ ...prev, __cfRollback: true }, { merge: false });
      }
    }
  } catch (e) {
    // Best-effort rollback; swallow errors to ensure we still throw the main denial error
  }
}

/**
 * Gen 1 Firestore trigger: When a new quote is created, create an admin notification.
 * Path: quotes/{docId}
 */
export const onQuoteCreated = functions.firestore
  .document("quotes/{docId}")
  .onCreate(async (snap) => {
    const data = snap.data() as {
      customerEmail?: string | null;
      userUid?: string | null;
      quoteType?: string | null;
    };

    const docId = snap.id;
    const email = (data.customerEmail || "").toString().trim().toLowerCase();
    const quoteType = (data.quoteType || "General").toString().trim();
    const userUid = (data.userUid || "").toString().trim();

    const title = "New Quote Request Received";
    const message = `A new ${quoteType} quote request has been submitted by ${email || "unknown user"}. Please review and provide an estimation.`;

    await db.collection("Admin_Notifications").add({
      title,
      message,
      type: "quote_request",
      status: "unread",
      createdAt: FieldValue.serverTimestamp(),
      priority: "medium",
      customerEmail: email || null,
      customerUid: userUid || null,
      relatedEntityId: docId,
      relatedEntityType: "quote",
    });
  });

/**
 * Gen 1 Firestore trigger: When a support ticket is deleted, delete its
 * Storage attachment if the document had an imageUrl.
 * Path: Support_Tickets/{ticketId}
 */
export const onSupportTicketDeleted = functions.firestore
  .document("Support_Tickets/{ticketId}")
  .onDelete(async (snap) => {
    try {
      const data = (snap.data() || {}) as { imageUrl?: string | null };
      const imageUrl = data?.imageUrl;
      if (!imageUrl) return null;

      let bucketName: string | undefined;
      let filePath: string | undefined;

      try {
        if (imageUrl.startsWith("gs://")) {
          const noScheme = imageUrl.replace("gs://", "");
          const firstSlash = noScheme.indexOf("/");
          if (firstSlash > 0) {
            bucketName = noScheme.substring(0, firstSlash);
            filePath = noScheme.substring(firstSlash + 1);
          }
        } else if (imageUrl.includes("/o/")) {
          const url = new URL(imageUrl);
          const parts = url.pathname.split("/");
          const bIdx = parts.indexOf("b");
          const oIdx = parts.indexOf("o");
          if (bIdx >= 0 && bIdx + 1 < parts.length) {
            bucketName = parts[bIdx + 1];
          }
          if (oIdx >= 0 && oIdx + 1 < parts.length) {
            filePath = decodeURIComponent(parts[oIdx + 1]);
          } else {
            const nameParam = url.searchParams.get("name");
            if (nameParam) filePath = decodeURIComponent(nameParam);
          }
        }
      } catch {}

      if (!filePath) return null;
      const storage = getStorage();
      const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
      await bucket.file(filePath).delete({ ignoreNotFound: true });
    } catch {}
    return null;
  });

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onQuoteCreated = exports.onSecureDataWrite = exports.onRequestServiceCreated = exports.onContactRequestCreated = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
// Initialize Admin SDK once per environment
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
/**
 * Gen 1 Firestore trigger: When a new contact request is created, create an admin notification.
 * Path: contactRequests/{docId}
 */
exports.onContactRequestCreated = functions.firestore
    .document("contactRequests/{docId}")
    .onCreate(async (snap) => {
    const data = snap.data();
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
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
        if (!snap.empty)
            await batch.commit();
    }
    catch { }
});
/**
 * Gen 1 Firestore trigger: When a new service request is created by a user,
 * create an admin notification so admins are alerted in real-time.
 * Path: Request_service/{requestId}
 */
exports.onRequestServiceCreated = functions.firestore
    .document("Request_service/{requestId}")
    .onCreate(async (snap, context) => {
    try {
        const req = (snap.data() || {});
        const requestId = snap.id;
        const uid = (req.uid || "").toString();
        const service = (req.service || "").toString();
        const devices = Array.isArray(req.devices) ? req.devices : [];
        const date = (req.date || "").toString();
        const time = (req.time || "").toString();
        const priorityRaw = (req.priority || "normal").toString().toLowerCase();
        const priority = priorityRaw === "high" ? "high" : priorityRaw === "low" ? "low" : "medium";
        // Attempt to resolve customer email from Accounts/{uid}
        let email = null;
        if (uid) {
            try {
                const acc = await db.collection("Accounts").doc(uid).get();
                email = (acc.data()?.Email || null) ? String(acc.data().Email) : null;
            }
            catch { }
        }
        const title = "New Service Request";
        const message = `${email || "A user"} submitted a ${service || "service"} request (${devices.length} device${devices.length === 1 ? "" : "s"})${date || time ? ` for ${[date, time].filter(Boolean).join(" ")}` : ""}.`.trim();
        await db.collection("Admin_Notifications").add({
            title,
            message,
            type: "service_request",
            status: "unread",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            relatedEntityId: requestId,
            relatedEntityType: "service_request",
            customerEmail: email,
            customerUid: uid || null,
            priority,
        });
    }
    catch (e) {
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
exports.onSecureDataWrite = functions.firestore
    .document("secureData/{docId}")
    .onWrite(async (change, context) => {
    // Re-entrancy guard: if this write was produced by our rollback, skip checks
    try {
        if ((change.after.exists && (change.after.get("__cfRollback") === true)) ||
            (change.before.exists && (change.before.get("__cfRollback") === true))) {
            return null;
        }
    }
    catch { }
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    const action = !beforeExists && afterExists
        ? "create"
        : beforeExists && afterExists
            ? "update"
            : "delete";
    // Authentication required
    const auth = context.auth;
    if (!auth) {
        await rollbackOnViolation(change, action);
        throw new functions.https.HttpsError("permission-denied", "Permission denied: not authenticated");
    }
    const uid = auth.uid;
    const token = (auth.token || {});
    const claimRole = (token.role || token.Role || "").toString().toLowerCase();
    // Determine admin via custom claim first; fallback to Accounts/{uid}.Role
    let isAdmin = claimRole === "admin";
    if (!isAdmin) {
        try {
            const accSnap = await db.collection("Accounts").doc(uid).get();
            const role = (accSnap.data()?.Role || "").toString().toLowerCase();
            if (role === "admin" || role === "super admin") {
                isAdmin = true;
            }
        }
        catch { }
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
        throw new functions.https.HttpsError("permission-denied", "Permission denied: delete not allowed for regular users");
    }
    if (!isOwner) {
        await rollbackOnViolation(change, action);
        throw new functions.https.HttpsError("permission-denied", "Permission denied: not an admin or owner");
    }
    // Owner performing create/update is allowed
    return null;
});
/**
 * Attempt to reverse the write when a violation is detected.
 * Adds a `__cfRollback: true` flag to prevent re-trigger loops.
 */
async function rollbackOnViolation(change, action) {
    try {
        if (action === "create") {
            // Delete the newly created document
            if (change.after.exists) {
                await change.after.ref.delete();
            }
        }
        else if (action === "update") {
            // Restore previous state
            const prev = change.before.data();
            if (prev) {
                await change.after.ref.set({ ...prev, __cfRollback: true }, { merge: false });
            }
        }
        else if (action === "delete") {
            // Recreate the deleted document
            const prev = change.before.data();
            if (prev) {
                await change.before.ref.set({ ...prev, __cfRollback: true }, { merge: false });
            }
        }
    }
    catch (e) {
        // Best-effort rollback; swallow errors to ensure we still throw the main denial error
    }
}
/**
 * Gen 1 Firestore trigger: When a new quote is created, create an admin notification.
 * Path: quotes/{docId}
 */
exports.onQuoteCreated = functions.firestore
    .document("quotes/{docId}")
    .onCreate(async (snap) => {
    const data = snap.data();
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        priority: "medium",
        customerEmail: email || null,
        customerUid: userUid || null,
        relatedEntityId: docId,
        relatedEntityType: "quote",
    });
});

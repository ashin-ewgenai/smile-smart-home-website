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
exports.onSupportTicketDeleted = exports.onQuoteCreated = exports.onSecureDataWrite = exports.onRequestServiceCreated = exports.onContactRequestCreated = exports.onSupportTicketCreatedGen1 = exports.getUserDeviceDetails = exports.checkExpiredWarranties = exports.onUserDeviceWriteWarrantyNotify = void 0;
/**
 * Warranty notifications
 * - Firestore trigger: on write to User_Devices, evaluate warranty and create/update
 *   unread 'warranty_expiry' notifications per device/serial.
 * - Scheduled function: daily sweep to ensure expired warranties still have an unread
 *   'warranty_expiry' notification for the user if at least one device is expired.
 */
const functions = __importStar(require("firebase-functions/v1"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
// Initialize Admin SDK once per environment
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
const db = (0, firestore_1.getFirestore)();
function toMillisFlexible(v) {
    try {
        if (!v && v !== 0)
            return null;
        if (v && typeof v === "object" && typeof v.toDate === "function") {
            return v.toDate().getTime();
        }
        if (typeof v === "number") {
            // If seconds, convert to ms
            return v < 1e12 ? v * 1000 : v;
        }
        if (typeof v === "string") {
            const t = Date.parse(v);
            return Number.isNaN(t) ? null : t;
        }
    }
    catch { }
    return null;
}
function extractExpiryCandidates(data) {
    const out = [];
    try {
        const pushIfValid = (v) => {
            const ms = toMillisFlexible(v);
            if (ms != null)
                out.push(ms);
        };
        pushIfValid(data?.warrantyExpiry);
        pushIfValid(data?.warrantyEnd);
        pushIfValid(data?.warrantyExpiryDate);
        pushIfValid(data?.warrantyEndDate);
        if (Array.isArray(data?.serials)) {
            for (const s of data.serials) {
                pushIfValid(s?.warrantyExpiry);
                pushIfValid(s?.expiryDate);
                pushIfValid(s?.warrantyEnd);
            }
        }
    }
    catch { }
    return out;
}
async function ensureUnreadWarrantyNotification(params) {
    const { uid, deviceId, deviceName, expiryAt, expired } = params;
    const message = expired
        ? `${deviceName || "Your device"} warranty expired on ${new Date(expiryAt).toLocaleDateString()}.`
        : `${deviceName || "Your device"} warranty expires on ${new Date(expiryAt).toLocaleDateString()}.`;
    const title = deviceName ? `${deviceName} • Warranty Expiry` : "Warranty Expiry";
    // Deterministic ID when deviceId is present, else per-user aggregate
    const baseId = deviceId ? `warranty_${uid}_${deviceId}` : `warranty_${uid}`;
    await db.collection("User_Notifications").doc(baseId).set({
        uid,
        title,
        message,
        type: "warranty_expiry",
        // Always ensure it's marked unread so the bell shows
        status: "unread",
        relatedDeviceId: deviceId || null,
        deviceName: deviceName || null,
        expiryAt,
        expired,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
exports.onUserDeviceWriteWarrantyNotify = functions.firestore
    .document("User_Devices/{docId}")
    .onWrite(async (change, context) => {
    try {
        const after = change.after.exists ? change.after.data() : null;
        const before = change.before.exists ? change.before.data() : null;
        const data = after || before;
        if (!data)
            return;
        const uid = data.uid;
        if (!uid)
            return;
        const deviceId = context.params.docId;
        const deviceName = data?.deviceName || data?.name || "Your device";
        const candidates = extractExpiryCandidates(data);
        if (!candidates.length)
            return;
        const now = Date.now();
        const in30Days = now + 30 * 24 * 60 * 60 * 1000;
        // Choose the nearest upcoming (<= 30 days) or any expired (any time in the past)
        let chosen = null;
        for (const t of candidates) {
            if (t <= now || t <= in30Days) {
                if (chosen == null)
                    chosen = t;
                else
                    chosen = Math.min(chosen, t);
            }
        }
        if (chosen == null)
            return;
        await ensureUnreadWarrantyNotification({
            uid,
            deviceId,
            deviceName,
            expiryAt: chosen,
            expired: chosen <= now,
        });
    }
    catch (e) {
        // Swallow errors to avoid retries storm
    }
});
exports.checkExpiredWarranties = functions.pubsub
    .schedule("every 24 hours")
    .timeZone("UTC")
    .onRun(async () => {
    const nowMs = Date.now();
    try {
        const userDevicesSnap = await db
            .collection("User_Devices")
            .select("uid", "warrantyExpiry", "warrantyEnd", "warrantyExpiryDate", "warrantyEndDate", "serials")
            .get();
        const expiredUids = new Set();
        userDevicesSnap.forEach((d) => {
            try {
                const data = d.data() || {};
                const uid = data.uid;
                if (!uid)
                    return;
                const candidates = extractExpiryCandidates(data);
                for (const t of candidates) {
                    if (t <= nowMs) {
                        expiredUids.add(uid);
                        break;
                    }
                }
            }
            catch { }
        });
        for (const uid of expiredUids) {
            try {
                await ensureUnreadWarrantyNotification({
                    uid,
                    expiryAt: nowMs, // aggregate notice doesn't have a specific device; use now
                    expired: true,
                });
            }
            catch { }
        }
    }
    catch { }
    return null;
});
exports.getUserDeviceDetails = functions.https.onCall(async (data, context) => {
    try {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Authentication required");
        }
        const uid = context.auth.uid;
        const deviceId = (data?.deviceId || "").toString().trim();
        const modelRaw = (data?.model || "").toString().trim();
        const nameRaw = (data?.name || "").toString().trim();
        const toLower = (s) => s.toLowerCase();
        const normalizeWarranty = (v) => {
            const ms = toMillisFlexible(v);
            return ms != null ? new Date(ms).toISOString() : null;
        };
        let docData = null;
        let docId = null;
        if (deviceId) {
            const snap = await db.collection("User_Devices").doc(deviceId).get();
            if (snap.exists) {
                const d = snap.data();
                if (!d?.uid || d.uid === uid) {
                    docData = d;
                    docId = snap.id;
                }
            }
        }
        else {
            const qSnap = await db.collection("User_Devices").where("uid", "==", uid).get();
            const candidates = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const model = toLower(modelRaw);
            const name = toLower(nameRaw);
            let filtered = candidates;
            if (model) {
                filtered = candidates.filter((d) => {
                    const models = [d.deviceModel, d.model, d.modelNumber]
                        .filter(Boolean)
                        .map((x) => toLower(String(x)));
                    return models.includes(model);
                });
            }
            else if (name) {
                filtered = candidates.filter((d) => {
                    const names = [d.deviceName, d.name]
                        .filter(Boolean)
                        .map((x) => toLower(String(x)));
                    return names.includes(name);
                });
            }
            if (filtered.length === 1) {
                docData = filtered[0];
                docId = filtered[0].id;
            }
            else if (!model && !name && candidates.length === 1) {
                docData = candidates[0];
                docId = candidates[0].id;
            }
            else {
                throw new functions.https.HttpsError("not-found", filtered.length === 0
                    ? "No matching device found for the user"
                    : "Multiple devices match the query; please specify deviceId or exact model/name");
            }
        }
        if (!docData || !docId) {
            throw new functions.https.HttpsError("not-found", "Device not found");
        }
        const d = docData;
        const serialCandidates = [d.deviceSerial, d.serial, d.serialNumber].filter(Boolean);
        const serial = serialCandidates.length > 0 ? String(serialCandidates[0]) : null;
        const serialsArray = Array.isArray(d.serials) ? d.serials : [];
        const serials = serialsArray
            .map((e) => ({
            serialNumber: e?.serialNumber ? String(e.serialNumber) : null,
            warrantyExpiry: normalizeWarranty(e?.warrantyExpiry) || normalizeWarranty(e?.warrantyEnd),
        }))
            .filter((e) => e.serialNumber);
        const warranty = normalizeWarranty(d.warrantyExpiry) ||
            normalizeWarranty(d.warrantyEnd) ||
            normalizeWarranty(d.warrantyExpiryDate) ||
            normalizeWarranty(d.warrantyEndDate);
        const documentation = d.documentation || d.manualUrl || null;
        return {
            device: {
                id: docId,
                name: d.deviceName || d.name || null,
                type: d.deviceType || d.type || null,
                model: d.deviceModel || d.model || d.modelNumber || null,
                brand: d.brand || null,
                serial,
                serials,
                warrantyExpiry: warranty,
                documentation,
            },
            message: warranty || serial || documentation
                ? "Device details fetched"
                : "No warranty/serial/documentation info found for this device",
        };
    }
    catch (e) {
        if (e instanceof functions.https.HttpsError)
            throw e;
        throw new functions.https.HttpsError("internal", e?.message || "Failed to fetch device details");
    }
});
/**
 * Gen 1 Firestore trigger: When a support ticket is created by a user,
 * create an admin notification so the admin bell can show an unread red dot.
 * Path: Support_Tickets/{ticketId}
 */
exports.onSupportTicketCreatedGen1 = functions.firestore
    .document("Support_Tickets/{ticketId}")
    .onCreate(async (snap) => {
    try {
        const data = (snap.data() || {});
        const ticketId = snap.id;
        const uid = (data.uid || data.userUid || "").toString();
        const description = (data.description || data.message || "").toString();
        const createdAt = data.createdAt || firestore_1.FieldValue.serverTimestamp();
        // Resolve customer email from Accounts/{uid} if missing on the ticket
        let email = (data.email || data.userEmail || null) ? String(data.email || data.userEmail) : null;
        if (!email && uid) {
            try {
                const acc = await db.collection("Accounts").doc(uid).get();
                email = (acc.data()?.Email || null) ? String(acc.data().Email) : null;
            }
            catch { }
        }
        const title = email ? `New Support Ticket from ${email}` : `New Support Ticket`;
        const message = description || "A new support ticket has been submitted.";
        await db.collection("Admin_Notifications").add({
            title,
            message,
            type: "support_ticket",
            status: "unread",
            createdAt,
            priority: "high",
            customerEmail: email,
            customerUid: uid || null,
            relatedEntityId: ticketId,
            relatedEntityType: "support_ticket",
        });
    }
    catch {
        // Best-effort only
        return null;
    }
    return null;
});
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
/**
 * Gen 1 Firestore trigger: When a support ticket is deleted, delete its
 * Storage attachment if the document had an imageUrl.
 * Path: Support_Tickets/{ticketId}
 */
exports.onSupportTicketDeleted = functions.firestore
    .document("Support_Tickets/{ticketId}")
    .onDelete(async (snap) => {
    try {
        const data = (snap.data() || {});
        const imageUrl = data?.imageUrl;
        if (!imageUrl)
            return null;
        let bucketName;
        let filePath;
        try {
            if (imageUrl.startsWith("gs://")) {
                const noScheme = imageUrl.replace("gs://", "");
                const firstSlash = noScheme.indexOf("/");
                if (firstSlash > 0) {
                    bucketName = noScheme.substring(0, firstSlash);
                    filePath = noScheme.substring(firstSlash + 1);
                }
            }
            else if (imageUrl.includes("/o/")) {
                const url = new URL(imageUrl);
                const parts = url.pathname.split("/");
                const bIdx = parts.indexOf("b");
                const oIdx = parts.indexOf("o");
                if (bIdx >= 0 && bIdx + 1 < parts.length) {
                    bucketName = parts[bIdx + 1];
                }
                if (oIdx >= 0 && oIdx + 1 < parts.length) {
                    filePath = decodeURIComponent(parts[oIdx + 1]);
                }
                else {
                    const nameParam = url.searchParams.get("name");
                    if (nameParam)
                        filePath = decodeURIComponent(nameParam);
                }
            }
        }
        catch { }
        if (!filePath)
            return null;
        const storage = (0, storage_1.getStorage)();
        const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
        await bucket.file(filePath).delete({ ignoreNotFound: true });
    }
    catch { }
    return null;
});

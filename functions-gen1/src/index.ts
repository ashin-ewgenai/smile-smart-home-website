import * as functions from "firebase-functions/v1";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Admin SDK once per environment
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

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

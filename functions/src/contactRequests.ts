import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Ensure Admin SDK is initialized (safe if already initialized elsewhere)
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

/**
 * When a new contact request is created by the public site, create an admin notification.
 * This keeps client security rules strict (no direct writes to Admin_Notifications from clients).
 */
export const onContactRequestCreated = onDocumentCreated(
  "contactRequests/{docId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

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
      type: "support_ticket",
      status: "unread",
      createdAt: FieldValue.serverTimestamp(),
      priority: "medium",
      customerEmail: email || null,
      relatedEntityId: docId,
      relatedEntityType: "contact_request",
    });
  }
);

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
exports.onPlannerLeadCreated = exports.onQuoteCreated = exports.onContactRequestCreated = void 0;
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
        type: "support_ticket",
        status: "unread",
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        priority: "medium",
        customerEmail: email || null,
        relatedEntityId: docId,
        relatedEntityType: "contact_request",
    });
});
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
 * Gen 1 Firestore trigger: When a new plan lead is created, create an admin notification.
 * Path: Planner_Leads/{docId}
 */
exports.onPlannerLeadCreated = functions.firestore
    .document("Planner_Leads/{docId}")
    .onCreate(async (snap) => {
    console.log("🚀 Plan lead created trigger fired for doc:", snap.id);
    try {
        const data = snap.data();
        console.log("📋 Plan lead data:", JSON.stringify(data, null, 2));
        const docId = snap.id;
        const email = (data.email || "").toString().trim().toLowerCase();
        const complexity = (data.complexity || "Basic").toString().trim();
        const spaceType = data.formData?.spaceType || "Unknown";
        const roomCount = data.formData?.roomCount || "Unknown";
        const goals = data.formData?.goals || [];
        const budget = data.formData?.budget || "Unknown";
        const title = "New Smart Home Plan Lead";
        const message = `A new ${complexity.toLowerCase()} smart home plan has been created by ${email || "unknown user"}. Space: ${spaceType}, Rooms: ${roomCount}, Goals: ${goals.join(", ") || "None specified"}, Budget: ${budget}.`;
        // Determine priority based on complexity and budget
        let priority = "low";
        if (complexity === "Advanced" || budget === "Premium") {
            priority = "high";
        }
        else if (complexity === "Intermediate" || budget === "Standard") {
            priority = "medium";
        }
        console.log("📧 Creating admin notification:", { title, message, priority });
        await db.collection("Admin_Notifications").add({
            title,
            message,
            type: "plan_lead",
            status: "unread",
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            priority,
            customerEmail: email || null,
            relatedEntityId: docId,
            relatedEntityType: "planner_lead",
        });
        console.log("✅ Admin notification created successfully");
    }
    catch (error) {
        console.error("❌ Error in onPlannerLeadCreated:", error);
        throw error;
    }
});

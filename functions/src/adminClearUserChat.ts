import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";

const db = getFirestore();

/**
 * Callable: Admin clears all chat_sessions and messages for a given userId (uid)
 * Only Super Admin or Admin can invoke this.
 * request.data: { uid: string }
 */
export const adminClearUserChat = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  const targetUid = request.data?.uid as string | undefined;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }

  console.log(`Admin ${authCtx.uid} attempting to clear chat for user ${targetUid}`);

  // Allow both Super Admin and Admin roles
  const callerSnap = await db.collection("Accounts").doc(authCtx.uid).get();
  const role = callerSnap.exists ? (callerSnap.data()?.Role as string | undefined) : undefined;
  console.log(`Caller role: ${role}`);
  
  if (role !== "Super Admin" && role !== "Admin") {
    throw new HttpsError("permission-denied", "Only admins can clear chat history");
  }

  try {
    // Find all chat_sessions for this user
    const sessionsSnap = await db.collection("chat_sessions").where("ownerUid", "==", targetUid).get();
    console.log(`Found ${sessionsSnap.size} chat sessions for user ${targetUid}`);
    
    if (sessionsSnap.empty) {
      return {status: "ok", deletedSessions: 0, message: "No chat sessions found for this user"};
    }

    // Use multiple batches if needed (Firestore batch limit is 500 operations)
    const batches = [];
    let currentBatch = db.batch();
    let operationCount = 0;
    
    for (const docSnap of sessionsSnap.docs) {
      // Delete all messages subcollection
      const msgsCol = docSnap.ref.collection("messages");
      const msgsSnap = await msgsCol.get();
      console.log(`Session ${docSnap.id} has ${msgsSnap.size} messages`);
      
      for (const msgDoc of msgsSnap.docs) {
        if (operationCount >= 450) { // Leave some buffer
          batches.push(currentBatch);
          currentBatch = db.batch();
          operationCount = 0;
        }
        currentBatch.delete(msgDoc.ref);
        operationCount++;
      }
      
      // Delete the session doc
      if (operationCount >= 450) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        operationCount = 0;
      }
      currentBatch.delete(docSnap.ref);
      operationCount++;
    }
    
    // Add the final batch if it has operations
    if (operationCount > 0) {
      batches.push(currentBatch);
    }
    
    // Commit all batches
    for (const batch of batches) {
      await batch.commit();
    }
    
    console.log(`Successfully cleared ${sessionsSnap.size} chat sessions for user ${targetUid}`);
    return {status: "ok", deletedSessions: sessionsSnap.size, message: `Cleared ${sessionsSnap.size} chat sessions`};
  } catch (error: any) {
    console.error("Error clearing chat sessions:", error);
    throw new HttpsError("internal", `Failed to clear chat sessions: ${error?.message || error}`);
  }
});

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";
import {db} from "./core";

const storage = getStorage();

/** 
 * Callable: Admin bulk updates statuses (Kanban boards)
 * Centrally handles atomic status updates for Kanban pipelines 
 * 
 * Callable: Admin clears all chat_sessions and messages for a given userId (uid)
 * Only Super Admin or Admin can invoke this.
 * request.data: { uid: string }
 */
export const adminClearUserChat = onCall({
  cors: true,
}, async (request) => {
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
  
  const normalizedRole = role?.toLowerCase();
  if (normalizedRole !== "super admin" && normalizedRole !== "admin") {
    throw new HttpsError("permission-denied", "Only admins can clear chat history");
  }

  try {
    // Find all chat_sessions for this user
    const sessionsSnap = await db.collection("chat_sessions").where("ownerUid", "==", targetUid).get();
    console.log(`Found ${sessionsSnap.size} chat sessions for user ${targetUid}`);
    
    if (sessionsSnap.empty) {
      return {status: "ok", deletedSessions: 0, deletedImages: 0, message: "No chat or consultation sessions found for this user"};
    }

    // Collect all image URLs before deletion
    const imageUrls: string[] = [];
    let totalMessages = 0;
    
    for (const docSnap of sessionsSnap.docs) {
      const msgsCol = docSnap.ref.collection("messages");
      const msgsSnap = await msgsCol.get();
      totalMessages += msgsSnap.size;
      console.log(`Session ${docSnap.id} has ${msgsSnap.size} messages`);
      
      for (const msgDoc of msgsSnap.docs) {
        const msgData = msgDoc.data();
        if (msgData.imageUrl && typeof msgData.imageUrl === 'string') {
          imageUrls.push(msgData.imageUrl);
        }
      }
    }
    
    console.log(`Found ${imageUrls.length} images to delete from ${totalMessages} total messages`);

    // Delete images from Firebase Storage
    let deletedImagesCount = 0;
    const bucket = storage.bucket();
    
    for (const imageUrl of imageUrls) {
      try {
        // Extract file path from Firebase Storage URL
        // URLs typically look like: https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Fto%2Ffile.jpg?alt=media&token=...
        const urlParts = imageUrl.split('/o/');
        if (urlParts.length > 1) {
          const pathWithParams = urlParts[1];
          const filePath = decodeURIComponent(pathWithParams.split('?')[0]);
          
          const file = bucket.file(filePath);
          const [exists] = await file.exists();
          
          if (exists) {
            await file.delete();
            deletedImagesCount++;
            console.log(`Deleted image: ${filePath}`);
          } else {
            console.log(`Image not found in storage: ${filePath}`);
          }
        } else {
          console.log(`Invalid Firebase Storage URL format: ${imageUrl}`);
        }
      } catch (error: any) {
        console.error(`Failed to delete image ${imageUrl}:`, error?.message || error);
        // Continue with other images even if one fails
      }
    }

    // Use multiple batches if needed (Firestore batch limit is 500 operations)
    const batches = [];
    let currentBatch = db.batch();
    let operationCount = 0;
    
    for (const docSnap of sessionsSnap.docs) {
      // Delete all messages subcollection
      const msgsCol = docSnap.ref.collection("messages");
      const msgsSnap = await msgsCol.get();
      
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
    
    console.log(`Successfully cleared ${sessionsSnap.size} chat sessions and ${deletedImagesCount} images for user ${targetUid}`);
    return {
      status: "ok", 
      deletedSessions: sessionsSnap.size, 
      deletedImages: deletedImagesCount,
      totalImagesFound: imageUrls.length,
      message: `Cleared ${sessionsSnap.size} chat sessions and ${deletedImagesCount}/${imageUrls.length} images`
    };
  } catch (error: any) {
    console.error("Error clearing chat sessions:", error);
    throw new HttpsError("internal", `Failed to clear chat sessions: ${error?.message || error}`);
  }
});

/**
 * Callable: Admin bulk updates statuses (Kanban boards)
 */
export const adminUpdateStatuses = onCall({
  cors: true,
}, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) throw new HttpsError("unauthenticated", "Must be authenticated.");
  
  const callerSnap = await db.collection("Accounts").doc(authCtx.uid).get();
  const userData = callerSnap.exists ? callerSnap.data() : null;
  const role = (userData?.Role || userData?.role || "").toString().toLowerCase();
  
  if (role !== "super admin" && role !== "admin") {
    console.error(`[adminUpdateStatuses] Unauthorized caller ${authCtx.uid} with role: ${role}`);
    throw new HttpsError("permission-denied", "Only admins can update remote statuses.");
  }

  const updates = request.data?.updates as Array<{ collection: string; id: string; status: string }>;
  if (!updates || !Array.isArray(updates)) {
    throw new HttpsError("invalid-argument", "Updates array is required");
  }

  try {
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;

    for (const update of updates) {
      if (count >= 450) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        count = 0;
      }
      const ref = db.collection(update.collection).doc(update.id);
      currentBatch.update(ref, { status: update.status });
      count++;
    }
    
    if (count > 0) batches.push(currentBatch);
    for (const b of batches) await b.commit();

    return { status: "ok", updatedCount: updates.length };
  } catch (error: any) {
    console.error("Error bulk updating statuses:", error);
    throw new HttpsError("internal", `Failed to bulk update statuses: ${error?.message || error}`);
  }
});

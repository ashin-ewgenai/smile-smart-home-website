import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const db = getFirestore();
const COLLECTION_USER_SCENES = "User_Scenes";

/**
 * Save or update a user's scene.
 * request.data: { scene: Partial<Scene> }
 */
export const saveUserScene = onCall({ cors: true }, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { scene } = request.data || {};
  if (!scene || !scene.name || !Array.isArray(scene.actions)) {
    throw new HttpsError("invalid-argument", "Scene name and actions are required.");
  }

  const uid = authCtx.uid;
  const sceneData = {
    ...scene,
    uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    if (scene.id) {
      // Update existing scene
      const sceneRef = db.collection(COLLECTION_USER_SCENES).doc(scene.id);
      const existing = await sceneRef.get();
      if (!existing.exists || existing.data()?.uid !== uid) {
        throw new HttpsError("permission-denied", "Scene not found or unauthorized.");
      }
      await sceneRef.set(sceneData, { merge: true });
      return { status: "ok", id: scene.id };
    } else {
      // Create new scene
      const newScene = {
        ...sceneData,
        createdAt: FieldValue.serverTimestamp(),
      };
      const docRef = await db.collection(COLLECTION_USER_SCENES).add(newScene);
      return { status: "ok", id: docRef.id };
    }
  } catch (e: any) {
    console.error("Error saving scene:", e);
    throw new HttpsError("internal", e.message || "Failed to save scene.");
  }
});

/**
 * Get all scenes for the authenticated user.
 */
export const getUserScenes = onCall({ cors: true }, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  try {
    const snap = await db.collection(COLLECTION_USER_SCENES)
      .where("uid", "==", authCtx.uid)
      .orderBy("createdAt", "desc")
      .get();

    const scenes = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return { scenes };
  } catch (e: any) {
    console.error("Error fetching scenes:", e);
    throw new HttpsError("internal", e.message || "Failed to fetch scenes.");
  }
});

/**
 * Delete a user's scene.
 * request.data: { sceneId: string }
 */
export const deleteUserScene = onCall({ cors: true }, async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { sceneId } = request.data || {};
  if (!sceneId) {
    throw new HttpsError("invalid-argument", "sceneId is required.");
  }

  try {
    const sceneRef = db.collection(COLLECTION_USER_SCENES).doc(sceneId);
    const existing = await sceneRef.get();
    if (!existing.exists || existing.data()?.uid !== authCtx.uid) {
      throw new HttpsError("permission-denied", "Scene not found or unauthorized.");
    }

    await sceneRef.delete();
    return { status: "ok" };
  } catch (e: any) {
    console.error("Error deleting scene:", e);
    throw new HttpsError("internal", e.message || "Failed to delete scene.");
  }
});

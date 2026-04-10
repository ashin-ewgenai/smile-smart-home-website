import * as functionsV1 from "firebase-functions";
import { db } from "./core";

/**
 * submitReview (Gen 1)
 * Backend validation and persistence for user reviews.
 */
export const submitReview = functionsV1.https.onCall(async (data: any, context: any) => {
  const authCtx = context?.auth;
  if (!authCtx) {
    throw new functionsV1.https.HttpsError("unauthenticated", "Must be authenticated.");
  }

  const { rating, comment, media, userName } = data || {};

  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
    throw new functionsV1.https.HttpsError("invalid-argument", "Rating must be between 1 and 5.");
  }

  if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
    throw new functionsV1.https.HttpsError("invalid-argument", "Comment is required.");
  }

  try {
    const reviewData = {
      uid: authCtx.uid,
      userName: userName || "Anonymous",
      rating,
      comment: comment.trim(),
      media: Array.isArray(media) ? media : [],
      createdAt: Date.now(),
      status: 'approved'
    };

    console.log("Submitting review data via Cloud Function:", JSON.stringify(reviewData));
    const docRef = await db.collection("Reviews").add(reviewData);
    return { status: "ok", id: docRef.id };
  } catch (e: any) {
    console.error("Error in submitReview function:", e);
    return { 
      status: "error", 
      message: e?.message || "Internal server error"
    };
  }
});

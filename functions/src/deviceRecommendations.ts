import { onCall } from "firebase-functions/v2/https";

/**
 * getDeviceRecommendations (STUB)
 * Re-added to prevent deployment prompts while working on Reviews.
 */
export const getDeviceRecommendations = onCall({ cors: true }, async (request) => {
  return { 
    recommendations: [], 
    message: "AI Recommendations are temporarily disabled during reviews update." 
  };
});

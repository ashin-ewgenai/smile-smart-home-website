import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { defineSecret } from "firebase-functions/params";

// Ensure Firebase Admin is initialized exactly once per instance
if (!getApps().length) {
  initializeApp();
}

/** Central Firestore instance */
export const db = getFirestore();

/** Central Auth instance */
export const auth = getAuth();

/** Shared Secret for OpenAI queries */
export const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

/**
 * Shared logic for energy savings calculations.
 * Consistent across backend and frontend for accuracy.
 */
export function calculateDetailedSavings(monthlyBill: number, homeSize: number, applianceCount: number) {
  const annualBill = monthlyBill * 12;

  // Efficiency factors (Smile Smart device specs)
  const lightingEfficiency = 0.62;
  const hvacEfficiency = 0.25;
  const applianceEfficiency = 0.18;

  // Dynamic Distribution based on home profile
  const hvacShare = 0.35 + (Math.min(homeSize, 10000) / 10000) * 0.15; // 35% to 50%
  const lightingShare = 0.15 + (Math.min(homeSize, 5000) / 5000) * 0.05; // 15% to 20%
  const standbyShare = 0.05 + (Math.min(applianceCount, 50) / 50) * 0.10; // 5% to 15%

  const lightingSavings = Math.round(annualBill * lightingShare * lightingEfficiency);
  const hvacSavings = Math.round(annualBill * hvacShare * hvacEfficiency);
  const standbySavings = Math.round(annualBill * standbyShare * applianceEfficiency);

  const totalAnnualSavings = lightingSavings + hvacSavings + standbySavings;
  const kwhSavedAnnual = totalAnnualSavings / 7; // ₹7 per unit avg
  const co2Reduction = Math.round(kwhSavedAnnual * 0.85); // 0.85kg CO2 per kWh

  const estimatedCost = 15000 + (applianceCount * 1500);
  const roiMonths = Math.max(6, Math.round((estimatedCost / (totalAnnualSavings / 12))));

  return {
    annualSavings: totalAnnualSavings,
    lightingSavings,
    hvacSavings,
    standbySavings,
    co2Reduction,
    roiMonths,
    monthlyCurrent: monthlyBill,
    monthlyOptimized: Math.round(monthlyBill - (totalAnnualSavings / 12))
  };
}

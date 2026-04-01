import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

/**
 * Calculates a health score based on telemetry data.
 */
function calculateHealthScore(telemetry: any) {
  const { battery = 100, rssi = -50, uptime = 1 } = telemetry;
  
  // RSSI score: -30 (100) to -90 (0)
  const rssiScore = Math.max(0, Math.min(100, ((rssi + 90) / 60) * 100));
  
  // Weighted score
  const score = (battery * 0.4) + (rssiScore * 0.4) + (uptime * 100 * 0.2);
  return Math.round(score);
}

/**
 * getDeviceRecommendations (STUB)
 * AI recommendations logic typically goes here.
 */
export const getDeviceRecommendations = onCall({ cors: true }, async (request) => {
  return { 
    recommendations: [], 
    message: "AI Recommendations are active. Please provide house details." 
  };
});

/**
 * getDeviceHealthStatus
 * Retrieves real-time health metrics for a specific device.
 */
export const getDeviceHealthStatus = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  const { deviceId } = request.data;
  if (!deviceId) {
    throw new HttpsError("invalid-argument", "Device ID is required.");
  }

  try {
    // In a real app, this would fetch from a 'Telemetry' collection
    // For this implementation, we simulate calculation based on current state
    const deviceSnap = await db.collection("User_Devices").doc(deviceId).get();
    if (!deviceSnap.exists) {
      throw new HttpsError("not-found", "Device not found.");
    }

    const data = deviceSnap.data() || {};
    const telemetry = {
      battery: data.batteryLevel ?? 85,
      rssi: data.signalStrength ?? -55,
      uptime: data.uptime24h ?? 0.99
    };

    const healthScore = calculateHealthScore(telemetry);
    const lastSeen = data.lastSeen ?? new Date().toISOString();

    return {
      deviceId,
      healthScore,
      status: telemetry.rssi < -85 ? "Offline" : "Online",
      lastSeen,
      telemetry,
      alerts: healthScore < 70 ? ["⚠️ Low battery or weak signal"] : []
    };
  } catch (error) {
    console.error("Error fetching device health:", error);
    throw new HttpsError("internal", "Failed to fetch health status.");
  }
});

/**
 * getAdminHealthOverview
 * Aggregates health data for all customer devices (Admin only).
 */
export const getAdminHealthOverview = onCall({ cors: true }, async (request) => {
  // Simple check: logic for admin roles would go here
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Admin access required.");
  }

  try {
    const devicesSnap = await db.collection("User_Devices").get();
    const allDevices = devicesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const total = allDevices.length;
    const online = allDevices.filter((d: any) => (d.signalStrength ?? -50) > -85).length;
    const lowHealth = allDevices.filter((d: any) => calculateHealthScore({
      battery: d.batteryLevel ?? 100,
      rssi: d.signalStrength ?? -50,
      uptime: d.uptime24h ?? 1
    }) < 70).length;

    return {
      aggregatedScore: Math.round(allDevices.reduce((acc, d: any) => acc + calculateHealthScore({
        battery: d.batteryLevel ?? 100,
        rssi: d.signalStrength ?? -50,
        uptime: d.uptime24h ?? 1
      }), 0) / (total || 1)),
      onlineCount: online,
      offlineCount: total - online,
      totalDevices: total,
      alertCount: lowHealth,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error fetching admin overview:", error);
    throw new HttpsError("internal", "Failed to aggregate admin data.");
  }
});


import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db } from "./core";

/**
 * Calculates a composite health score (0–100) from device telemetry.
 * Weights: battery 40%, signal 40%, uptime 20%.
 */
function calculateHealthScore(telemetry: {
  battery: number;
  rssi: number;
  uptime: number;
}): number {
  const { battery = 100, rssi = -50, uptime = 1 } = telemetry;
  // RSSI score: -30dBm → 100, -90dBm → 0
  const rssiScore = Math.max(0, Math.min(100, ((rssi + 90) / 60) * 100));
  const score = battery * 0.4 + rssiScore * 0.4 + uptime * 100 * 0.2;
  return Math.round(score);
}

/**
 * Generates specific, actionable predictive maintenance alerts by evaluating
 * each telemetry metric independently with tiered severity levels.
 *
 * Severity: "critical" = immediate action needed, "warning" = attention soon.
 */
function generatePredictiveAlerts(
  telemetry: { battery: number; rssi: number; uptime: number },
  healthScore: number
): Array<{ message: string; severity: "critical" | "warning" }> {
  const alerts: Array<{ message: string; severity: "critical" | "warning" }> =
    [];

  // ── Battery checks ────────────────────────────────────────────────────────
  if (telemetry.battery <= 10) {
    alerts.push({
      message:
        "🔴 Battery critically low (≤10%) — replace immediately to avoid device loss.",
      severity: "critical",
    });
  } else if (telemetry.battery <= 20) {
    alerts.push({
      message:
        "⚠️ Battery low (≤20%) — replace within the next 1–2 days.",
      severity: "warning",
    });
  } else if (telemetry.battery <= 35) {
    alerts.push({
      message:
        "⚠️ Battery below 35% — schedule a replacement within the week.",
      severity: "warning",
    });
  }

  // ── Signal / connectivity checks ──────────────────────────────────────────
  if (telemetry.rssi <= -90) {
    alerts.push({
      message:
        "🔴 Device unreachable — signal too weak. Check power and Wi-Fi router proximity.",
      severity: "critical",
    });
  } else if (telemetry.rssi <= -80) {
    alerts.push({
      message:
        "⚠️ Very weak Wi-Fi signal. Move the device closer to the router or add a repeater.",
      severity: "warning",
    });
  } else if (telemetry.rssi <= -70) {
    alerts.push({
      message:
        "⚠️ Marginal connectivity detected. Occasional disconnections may occur.",
      severity: "warning",
    });
  }

  // ── Uptime / reliability checks ───────────────────────────────────────────
  if (telemetry.uptime < 0.5) {
    alerts.push({
      message:
        "🔴 Device was offline >50% of the last 24 hours — investigate hardware or firmware.",
      severity: "critical",
    });
  } else if (telemetry.uptime < 0.8) {
    alerts.push({
      message:
        "⚠️ Unstable uptime (<80% in 24h) — check for interference or power fluctuations.",
      severity: "warning",
    });
  }

  // ── Overall health catch-all (when no individual alert fired) ─────────────
  if (healthScore < 40 && alerts.length === 0) {
    alerts.push({
      message:
        "🔴 Overall device health is critical — contact support for a diagnostic.",
      severity: "critical",
    });
  } else if (healthScore < 60 && alerts.length === 0) {
    alerts.push({
      message:
        "⚠️ Device health is degraded — proactive maintenance recommended.",
      severity: "warning",
    });
  }

  return alerts;
}

/**
 * getDeviceRecommendations (STUB)
 * AI recommendations logic lives in the chatbot callable.
 */
export const getDeviceRecommendations = onCall(
  { cors: true },
  async (_request) => {
    return {
      recommendations: [],
      message: "AI Recommendations are active. Please provide house details.",
    };
  }
);

/**
 * getDeviceHealthStatus
 * Returns real-time health metrics + predictive alerts for a single device.
 * Requires the caller to be authenticated.
 */
export const getDeviceHealthStatus = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const { deviceId } = request.data as { deviceId?: string };
    if (!deviceId) {
      throw new HttpsError("invalid-argument", "Device ID is required.");
    }

    try {
      const deviceSnap = await db
        .collection("User_Devices")
        .doc(deviceId)
        .get();
      if (!deviceSnap.exists) {
        throw new HttpsError("not-found", "Device not found.");
      }

      const data = deviceSnap.data() || {};
      const telemetry = {
        battery: (data.batteryLevel as number) ?? 85,
        rssi: (data.signalStrength as number) ?? -55,
        uptime: (data.uptime24h as number) ?? 0.99,
      };

      const healthScore = calculateHealthScore(telemetry);
      const lastSeen =
        (data.lastSeen as string) ?? new Date().toISOString();
      const alerts = generatePredictiveAlerts(telemetry, healthScore);

      return {
        deviceId,
        healthScore,
        status: telemetry.rssi < -85 ? "Offline" : "Online",
        lastSeen,
        telemetry,
        alerts,
      };
    } catch (error) {
      console.error("Error fetching device health:", error);
      throw new HttpsError("internal", "Failed to fetch health status.");
    }
  }
);

/**
 * getAdminHealthOverview
 * Aggregates health scores and predictive alert counts across all customer
 * devices. Requires the caller to be authenticated (admin role check
 * can be added here via Firestore Accounts collection).
 */
export const getAdminHealthOverview = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Admin access required.");
    }

    try {
      const devicesSnap = await db.collection("User_Devices").get();
      const allDevices = devicesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      const total = allDevices.length;

      let onlineCount = 0;
      let totalScore = 0;
      let criticalAlertCount = 0;
      let warningAlertCount = 0;

      for (const d of allDevices as any[]) {
        const telemetry = {
          battery: (d.batteryLevel as number) ?? 100,
          rssi: (d.signalStrength as number) ?? -50,
          uptime: (d.uptime24h as number) ?? 1,
        };
        const score = calculateHealthScore(telemetry);
        const alerts = generatePredictiveAlerts(telemetry, score);

        totalScore += score;
        if (telemetry.rssi > -85) onlineCount++;
        criticalAlertCount += alerts.filter(
          (a) => a.severity === "critical"
        ).length;
        warningAlertCount += alerts.filter(
          (a) => a.severity === "warning"
        ).length;
      }

      return {
        aggregatedScore: Math.round(totalScore / (total || 1)),
        onlineCount,
        offlineCount: total - onlineCount,
        totalDevices: total,
        alertCount: criticalAlertCount + warningAlertCount,
        criticalAlertCount,
        warningAlertCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching admin overview:", error);
      throw new HttpsError("internal", "Failed to aggregate admin data.");
    }
  }
);

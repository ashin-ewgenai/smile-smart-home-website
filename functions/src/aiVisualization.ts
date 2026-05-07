import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { db, OPENAI_API_KEY, calculateDetailedSavings } from "./core";

// Declare global fetch for Node runtimes
declare const fetch: any;

/**
 * Deterministic fallback placement when no AI key or on error.
 */
function generateFallbackMarkers(
  deviceNames: string[]
): Array<{ deviceName: string; x: number; y: number; reason: string; icon: string }> {
  const positions = [
    { x: 20, y: 25 }, { x: 75, y: 20 }, { x: 50, y: 55 },
    { x: 15, y: 70 }, { x: 80, y: 65 }, { x: 40, y: 30 },
    { x: 65, y: 45 }, { x: 25, y: 50 },
  ];

  const iconMap: Record<string, string> = {
    camera: "📷", lock: "🔒", light: "💡", bulb: "💡",
    thermostat: "🌡️", sensor: "🔍", switch: "⚡", dimmer: "🔆",
    doorbell: "🔔", hub: "📡", plug: "🔌", alarm: "🚨",
  };

  return deviceNames.slice(0, 8).map((name, i) => {
    const pos = positions[i % positions.length];
    const lowerName = name.toLowerCase();
    const iconKey = Object.keys(iconMap).find((k) => lowerName.includes(k)) || "plug";

    return {
      deviceName: name,
      x: pos.x,
      y: pos.y,
      reason: `Optimal placement for ${name} based on room layout analysis.`,
      icon: iconMap[iconKey],
    };
  });
}

/**
 * analyzeRoomWithAI (Gen 2)
 *
 * Simplified name for standardized calling.
 */
export const analyzeRoomWithAI = onCall(
  { 
    region: "us-central1",
    secrets: [OPENAI_API_KEY],
    cors: true,
    timeoutSeconds: 120,
    memory: "1GiB"
  },
  async (request: CallableRequest) => {
    // 1. Auth check (Dual-Auth fallback for reliable propagation)
    const uid = request.auth?.uid || request.data?.uid;
    if (!uid) {
      console.error("[analyzeRoomWithAI] Auth Failure: No UID found in auth or data.");
      throw new HttpsError("unauthenticated", "You must be signed in to use Room Visualizer.");
    }

    const { imageUrl, deviceNames } = request.data || {};
    if (!imageUrl) throw new HttpsError("invalid-argument", "imageUrl is required.");
    if (!deviceNames || !Array.isArray(deviceNames)) {
      throw new HttpsError("invalid-argument", "deviceNames are required.");
    }

    try {
      // Access secret optionally to avoid crash if not configured in Firebase
      let apiKey: string | null = null;
      try {
        apiKey = OPENAI_API_KEY.value();
        console.log("[analyzeRoomWithAI] Secret loaded successfully.");
      } catch (e) {
        console.warn("[analyzeRoomWithAI] Secret 'OPENAI_API_KEY' not configured or inaccessible.");
      }

      // Fallback if no key (Demo Mode)
      if (!apiKey) {
        return {
          markers: generateFallbackMarkers(deviceNames),
          roomType: "Living Room",
          lightingQuality: "Good",
          wifiCoverageNote: "Demo mode: Showing suggested placement. Configure your OpenAI API key for AI-powered analysis.",
          generalInsight: "Please set your OPENAI_API_KEY in Firebase Secrets to enable full AI analysis.",
          demoMode: true,
        };
      }

      const deviceListStr = deviceNames.map((d: string, i: number) => `${i + 1}. ${d}`).join("\n");
      const systemPrompt = `You are a smart home installation expert. Analyze the room photo and determine device positions as JSON:
{
  "markers": [{ "deviceName": "...", "x": 45, "y": 30, "reason": "...", "icon": "💡" }],
  "roomType": "...",
  "lightingQuality": "Good",
  "wifiCoverageNote": "...",
  "generalInsight": "..."
}`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: `Analyze this room for:\n${deviceListStr}` },
                { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[analyzeRoomWithAI] OpenAI API Error (${response.status}):`, errorText);
        throw new Error(`OpenAI Vision call failed: ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from AI.");

      const parsed = JSON.parse(content);
      const markers = (parsed.markers || []).slice(0, 12).map((m: any) => ({
        deviceName: String(m.deviceName || "").slice(0, 80),
        x: Math.min(100, Math.max(0, Number(m.x) || 50)),
        y: Math.min(100, Math.max(0, Number(m.y) || 50)),
        reason: String(m.reason || "").slice(0, 200),
        icon: String(m.icon || "📡").slice(0, 4),
      }));

      // Analytics log (non-blocking)
      try {
        await db.collection("room_analyses").add({ 
          uid, 
          analyzedAt: Date.now(),
          image: imageUrl,
          count: deviceNames.length 
        });
      } catch (e) {}

      return {
        markers,
        roomType: String(parsed.roomType || "Room"),
        lightingQuality: parsed.lightingQuality || "Good",
        wifiCoverageNote: String(parsed.wifiCoverageNote || ""),
        generalInsight: String(parsed.generalInsight || ""),
        demoMode: false,
      };
    } catch (error: any) {
      console.error("[analyzeRoomWithAI] Execution Error:", error);
      return {
        markers: generateFallbackMarkers(deviceNames),
        roomType: "Room",
        lightingQuality: "Good",
        wifiCoverageNote: "Check router positioning.",
        generalInsight: `AI analysis encountered an issue: ${error.message || "Unknown error"}. (Showing demo markers)`,
        demoMode: true,
      };
    }
  }
);

/**
 * calculateEnergySavings (V2 Callable)
 * Exposes detailed energy savings breakdown.
 */
export const calculateEnergySavings = onCall(
  {
    region: "us-central1",
    cors: true,
  },
  async (request: CallableRequest) => {
    const { monthlyBill, homeSize, applianceCount } = request.data || {};
    
    if (!monthlyBill || !homeSize) {
      throw new HttpsError("invalid-argument", "monthlyBill and homeSize are required.");
    }

    // Use the shared core logic
    const results = calculateDetailedSavings(
      Number(monthlyBill), 
      Number(homeSize), 
      Number(applianceCount || 0)
    );

    return {
      status: "ok",
      data: results
    };
  }
);

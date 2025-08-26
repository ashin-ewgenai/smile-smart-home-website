import {onCall, HttpsError, CallableRequest} from "firebase-functions/v2/https";
import {setGlobalOptions} from "firebase-functions/v2/options";
import {initializeApp, getApps} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";

// Configure global options (tune as needed)
setGlobalOptions({region: "us-central1", maxInstances: 10});

// Callable: Fetch basic product preview metadata (avoids iframe embedding issues)
// request.data: { url: string }
export const fetchProductPreview = onCall(async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const url = (request.data?.url as string | undefined)?.trim();
  if (!url) throw new HttpsError("invalid-argument", "url is required");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new HttpsError("invalid-argument", "Invalid URL");
  }
  // Restrict to well-known shopping domains to reduce SSRF risk
  if (!(/amazon\./i.test(u.hostname) || /flipkart\./i.test(u.hostname))) {
    throw new HttpsError("permission-denied", "Domain not allowed");
  }

  try {
    const resp = await fetch(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/123 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9," +
            "image/avif,image/webp,*/*;q=0.8",
        },
      } as RequestInit,
    );
    if (!resp.ok) {
      throw new HttpsError("unavailable", `Fetch failed: ${resp.status}`);
    }
    const html = await resp.text();

    // Minimal meta extraction without external deps
    const getMeta = (name: string) => {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`,
        "i",
      );
      const m = html.match(re);
      return m?.[1] ?? null;
    };

    // Try OpenGraph first
    const ogTitle = getMeta("og:title") || getMeta("twitter:title");
    const ogImage = getMeta("og:image") || getMeta("twitter:image");
    const ogUrl = getMeta("og:url");
    const ogDesc = getMeta("og:description") || getMeta("description");

    // Try to parse JSON-LD for price/rating (best-effort)
    let price: string | null = null;
    let rating: string | null = null;
    try {
      const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (ldMatch) {
        const json = JSON.parse(ldMatch[1].trim());
        const obj = Array.isArray(json) ? json.find((x) => x && typeof x === "object") : json;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const offers = obj?.offers || (obj?.["@graph"]?.find((x: any) => x.offers)?.offers);
        if (offers) {
          const priceVal = offers.price || offers[0]?.price;
          const currency = offers.priceCurrency || offers[0]?.priceCurrency || "";
          if (priceVal) price = currency ? `${currency} ${priceVal}` : String(priceVal);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agg = obj?.aggregateRating || (obj?.["@graph"]?.find((x: any) => x.aggregateRating)?.aggregateRating);
        if (agg?.ratingValue) {
          rating = String(agg.ratingValue);
        }
      }
    } catch {
      // best-effort parsing; ignore JSON-LD failures
    }

    const site = /amazon\./i.test(u.hostname) ? "Amazon" : (/flipkart\./i.test(u.hostname) ? "Flipkart" : u.hostname);

    return {
      url,
      site,
      title: ogTitle,
      image: ogImage,
      description: ogDesc,
      price,
      rating,
      canonical: ogUrl,
    };
  } catch (e) {
    const err = e as { message?: string };
    throw new HttpsError("internal", err?.message || "Preview fetch failed");
  }
});

// ======= Secure OpenAI Chat Callable (uses Functions v2 secret) =======
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

// request.data: { messages: {role:'system'|'user'|'assistant', content:string}[], model?: string, sessionId?: string }
// response: { reply: string, sessionId: string }
export const chatWithOpenAI = onCall({secrets: [OPENAI_API_KEY]}, async (request: CallableRequest) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const msgs = request.data?.messages as Array<{ role: string; content: string }> | undefined;
  const model = (request.data?.model as string | undefined) || "gpt-4o-mini";
  let sessionId = (request.data?.sessionId as string | undefined)?.trim();

  if (!Array.isArray(msgs) || msgs.length === 0) {
    throw new HttpsError("invalid-argument", "messages array is required");
  }

  // Bound and sanitize context
  const clean = msgs
    .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({
      role: (m.role === "system" || m.role === "assistant" || m.role === "user") ? m.role : "user",
      content: m.content.slice(0, 4000),
    }));

  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured");

  // ---- Minimal per-user rate limiting: 3s cooldown, 15 calls per 60s ----
  const COOLDOWN_MS = 3000;
  const WINDOW_MS = 60_000;
  const MAX_PER_WINDOW = 15;
  const uid = authCtx.uid;
  const rlRef = db.collection("rate_limits").doc(uid);
  const nowTs = Date.now();
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rlRef);
      const data = (
        snap.exists ?
          (snap.data() as { lastTs?: unknown; windowStart?: unknown; count?: unknown }) :
          {}
      ) || {};
      const lastTs = Number(data.lastTs ?? 0);
      const windowStart = Number(data.windowStart ?? 0);
      const count = Number(data.count ?? 0);

      // Cooldown check
      if (nowTs - lastTs < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - (nowTs - lastTs)) / 1000);
        throw new HttpsError(
          "resource-exhausted",
          `Please wait ${waitSec}s before trying again.`,
        );
      }

      // Sliding window (bucketed) check
      if (nowTs - windowStart >= WINDOW_MS) {
        // Reset window
        tx.set(rlRef, {lastTs: nowTs, windowStart: nowTs, count: 1}, {merge: true});
      } else {
        if (count >= MAX_PER_WINDOW) {
          throw new HttpsError("resource-exhausted", "Rate limit exceeded. Try again in a minute.");
        }
        tx.set(rlRef, {lastTs: nowTs, count: count + 1}, {merge: true});
      }
    });
  } catch (e) {
    // If it's a resource-exhausted error from our checks, rethrow. Otherwise, ignore.
    if (e instanceof HttpsError && e.code === "resource-exhausted") {
      throw e;
    }
    // Be conservative and allow if transaction failed due to transient errors.
  }

  // Firestore persistence in top-level collection
  // Note: uid already defined above
  const sessionsCol = db.collection("chat_sessions");
  const now = Date.now();
  try {
    if (!sessionId) {
      sessionId = `${uid}_${now}_${Math.random().toString(36).slice(2, 8)}`;
      await sessionsCol.doc(sessionId).set(
        {
          ownerUid: uid,
          createdAt: now,
          updatedAt: now,
          status: "active",
          model,
        },
        {merge: true},
      );
    } else {
      await sessionsCol.doc(sessionId).set(
        {
          ownerUid: uid,
          updatedAt: now,
          status: "active",
          model,
        },
        {merge: true},
      );
    }
    const lastUser = [...clean].reverse().find((m) => m.role === "user");
    if (lastUser) {
      await sessionsCol.doc(sessionId).collection("messages").add({role: "user", content: lastUser.content, ts: now});
    }
  } catch {
    // Ignore session persistence errors
  }

  // Ensure we have a safe session id for subsequent writes
  const sid = sessionId || `${uid}_${now}`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`},
      body: JSON.stringify({model, messages: clean, temperature: 0.4, max_tokens: 500}),
    } as RequestInit);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      try {
        await sessionsCol.doc(sid).set(
          {status: "error", updatedAt: Date.now()},
          {merge: true},
        );
        const errSnippet = text?.slice(0, 500);
        await sessionsCol.doc(sid).collection("messages").add({
          role: "assistant",
          content: `Error: ${resp.status} ${errSnippet}`,
          ts: Date.now(),
          error: true,
        });
      } catch {
        // Ignore logging failures
      }
      throw new HttpsError("unavailable", `OpenAI error: ${resp.status} ${text?.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      try {
        await sessionsCol.doc(sid).set(
          {status: "error", updatedAt: Date.now()},
          {merge: true},
        );
        await sessionsCol.doc(sid).collection("messages").add({
          role: "assistant",
          content: "No content in OpenAI response",
          ts: Date.now(),
          error: true,
        });
      } catch {
        // Ignore logging failures
      }
      throw new HttpsError("data-loss", "No content in OpenAI response");
    }

    try {
      await sessionsCol.doc(sid).collection("messages").add({role: "assistant", content, ts: Date.now()});
      await sessionsCol.doc(sid).set({updatedAt: Date.now(), status: "active"}, {merge: true});
    } catch {
      // Ignore logging failures
    }

    return {reply: content, sessionId};
  } catch (e) {
    const err = e as { message?: string };
    try {
      await sessionsCol.doc(sid).set(
        {status: "error", updatedAt: Date.now()},
        {merge: true},
      );
      const exceptionSnippet = err?.message || "Chat call failed";
      await sessionsCol.doc(sid).collection("messages").add({
        role: "assistant",
        content: `Exception: ${exceptionSnippet}`,
        ts: Date.now(),
        error: true,
      });
    } catch {
      // Ignore logging failures
    }
    throw new HttpsError("internal", err?.message || "Chat call failed");
  }
});
// Initialize Admin SDK once
if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const adminAuth = getAuth();

// Callable function to delete both Auth user and Firestore account doc
export const superAdminDeleteUser = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const callerUid = authCtx.uid;
  const targetUid = request.data?.uid as string | undefined;
  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }
  if (callerUid === targetUid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot delete your own account."
    );
  }

  // Verify caller is Super Admin
  const callerSnap = await db.collection("Accounts").doc(callerUid).get();
  const callerRole = callerSnap.exists ?
    (callerSnap.data()?.Role as string) :
    undefined;
  if (callerRole !== "Super Admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Super Admin can perform this action."
    );
  }

  // Block deleting Super Admins
  const targetRef = db.collection("Accounts").doc(targetUid);
  const targetSnap = await targetRef.get();
  const targetRole = targetSnap.exists ?
    (targetSnap.data()?.Role as string) :
    undefined;
  if (targetRole === "Super Admin") {
    throw new HttpsError(
      "failed-precondition",
      "Cannot delete a Super Admin account."
    );
  }

  try {
    // Delete from Firebase Authentication (ignore user-not-found)
    try {
      await adminAuth.deleteUser(targetUid);
    } catch (e) {
      const err = e as {code?: string; errorInfo?: {code?: string}};
      const code = err?.code || err?.errorInfo?.code || "";
      if (!String(code).includes("auth/user-not-found")) {
        throw err;
      }
    }
    // Delete Firestore user document
    await targetRef.delete();
    return {status: "ok"};
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "Delete failed");
  }
});

/**
 * Ensure the caller has Super Admin role; throws HttpsError if not.
 * @param {string} callerUid UID of the caller to validate.
 */
async function assertSuperAdmin(callerUid: string) {
  const snap = await db.collection("Accounts").doc(callerUid).get();
  const role = snap.exists ? (snap.data()?.Role as string) : undefined;
  if (role !== "Super Admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Super Admin can perform this action."
    );
  }
}

export const superAdminGetUser = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const uid = request.data?.uid as string | undefined;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }

  await assertSuperAdmin(authCtx.uid);

  try {
    // Auth user (null if not found)
    let authUser: unknown = null;
    try {
      const rec = await adminAuth.getUser(uid);
      authUser = {
        uid: rec.uid,
        email: rec.email ?? null,
        phoneNumber: rec.phoneNumber ?? null,
        displayName: rec.displayName ?? null,
        disabled: rec.disabled,
        emailVerified: rec.emailVerified,
        providerData: rec.providerData?.map((p) => ({
          providerId: p.providerId,
          uid: p.uid,
          email: p.email ?? null,
          displayName: p.displayName ?? null,
          phoneNumber: p.phoneNumber ?? null,
          photoURL: p.photoURL ?? null,
        })) ?? [],
        customClaims: rec.customClaims ?? {},
        metadata: {
          creationTime: rec.metadata.creationTime ?? null,
          lastSignInTime: rec.metadata.lastSignInTime ?? null,
        },
      };
    } catch (e) {
      const err = e as {code?: string};
      if (err?.code !== "auth/user-not-found") throw e;
    }

    // Firestore account doc (null if not found)
    const userDocSnap = await db.collection("Accounts").doc(uid).get();
    const fsUser = userDocSnap.exists ? {id: userDocSnap.id, ...userDocSnap.data()} : null;

    return {authUser, fsUser};
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "Fetch failed");
  }
});

// Callable: List user IDs from Firebase Auth (paginated) and Firestore
// request.data: { pageToken?: string, maxResults?: number }
export const superAdminListUserIds = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  await assertSuperAdmin(authCtx.uid);

  const pageToken = request.data?.pageToken as string | undefined;
  const maxResultsRaw = request.data?.maxResults as number | undefined;
  const maxResults = Math.min(Math.max(maxResultsRaw ?? 100, 1), 1000);

  try {
    // Auth IDs (paginated)
    const listRes = await adminAuth.listUsers(maxResults, pageToken);
    const authIds = listRes.users.map((u) => u.uid);

    // Firestore IDs (all in Accounts) — keep light by not returning entire docs
    const fsSnap = await db.collection("Accounts").select().get();
    const fsIds = fsSnap.docs.map((d) => d.id);

    return {
      auth: {ids: authIds, nextPageToken: listRes.pageToken || null},
      firestore: {ids: fsIds},
    };
  } catch (e) {
    const err = e as {message?: string};
    throw new HttpsError("internal", err?.message || "List failed");
  }
});

// Callable: Update a user's Auth record (email/displayName) and Firestore account doc
// request.data: { uid: string, email?: string, displayName?: string }
export const superAdminUpdateUser = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError("unauthenticated", "Must be authenticated.");
  }

  const uid = request.data?.uid as string | undefined;
  const email = request.data?.email as string | undefined;
  const displayName = request.data?.displayName as string | undefined;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required");
  }

  await assertSuperAdmin(authCtx.uid);

  try {
    // Load target to check role (to avoid modifying Super Admin accounts silently)
    const targetRef = db.collection("Accounts").doc(uid);
    const targetSnap = await targetRef.get();
    const targetRole = targetSnap.exists ? (targetSnap.data()?.Role as string | undefined) : undefined;
    if (targetRole === "Super Admin") {
      throw new HttpsError("failed-precondition", "Cannot modify Super Admin via this endpoint.");
    }

    // Build update payload for Auth
    const update: { email?: string; displayName?: string } = {};
    if (typeof email === "string" && email.trim()) update.email = email.trim();
    if (typeof displayName === "string") {
      // allow empty to clear
      update.displayName = (displayName || null) as unknown as string;
    }

    if (Object.keys(update).length > 0) {
      await adminAuth.updateUser(uid, update);
    }

    // Sync Firestore fields to keep consistent (Accounts schema)
    const fsUpdate: Record<string, unknown> = {};
    if (typeof email === "string" && email.trim()) fsUpdate.Email = email.trim();
    if (typeof displayName === "string") {
      fsUpdate.FullName = displayName || "";
    }
    if (Object.keys(fsUpdate).length > 0) {
      await targetRef.set(fsUpdate, {merge: true});
    }

    return {status: "ok"};
  } catch (e) {
    const err = e as { message?: string; code?: string };
    // Map common Auth errors to https error
    if ((err.code || "").includes("auth/")) {
      throw new HttpsError("failed-precondition", err.message || "Auth update failed");
    }
    throw new HttpsError("internal", err?.message || "Update failed");
  }
});


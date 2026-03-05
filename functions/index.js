/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

admin.initializeApp();

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-Ezee-Notify-Secret");
}

function json(res, status, payload) {
  res.status(status).set("Content-Type", "application/json").send(JSON.stringify(payload));
}

exports.notifyNewSubmission = onRequest(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const secret = process.env.EZEE_NOTIFY_SECRET;
    if (secret) {
      const headerSecret = req.get("X-Ezee-Notify-Secret") || "";
      if (headerSecret !== secret) {
        return json(res, 401, { ok: false, error: "Unauthorized" });
      }
    }

    const body = req.body || {};
    const submissionId = String(body.submissionId || "").trim();
    const clientName = String(body.clientName || "").trim();
    const agentScCode = String(body.agentScCode || "").trim();

    if (!submissionId) {
      return json(res, 400, { ok: false, error: "submissionId is required" });
    }

    const db = admin.firestore();
    const snap = await db.collection("adminDevices").where("onDuty", "==", true).get();
    const tokens = [];
    snap.forEach((doc) => {
      const t = doc.id;
      if (t) tokens.push(t);
    });

    if (tokens.length === 0) {
      logger.info("No on-duty admin devices found; skipping notification", { submissionId });
      return json(res, 200, { ok: true, sent: 0, skipped: true });
    }

    const title = "New agent submission";
    const namePart = clientName ? `: ${clientName}` : "";
    const bodyText = `Submission ${submissionId}${namePart}${agentScCode ? ` (SC ${agentScCode})` : ""}`;

    const message = {
      tokens,
      notification: {
        title,
        body: bodyText,
      },
      data: {
        submissionId,
        clientName,
        agentScCode,
      },
      webpush: {
        notification: {
          title,
          body: bodyText,
          icon: "/favicon.ico",
        },
        fcmOptions: {
          link: "/admin/dashboard.html",
        },
      },
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];
    resp.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || "";
        if (code === "messaging/invalid-registration-token" || code === "messaging/registration-token-not-registered") {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const batch = db.batch();
      for (const t of invalidTokens) {
        batch.delete(db.collection("adminDevices").doc(t));
      }
      await batch.commit();
    }

    return json(res, 200, {
      ok: true,
      requested: tokens.length,
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      cleanedInvalidTokens: invalidTokens.length,
    });
  } catch (err) {
    logger.error("notifyNewSubmission failed", err);
    return json(res, 500, { ok: false, error: err?.message || String(err) });
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function safeJsonParse(str, name) {
  try {
    return JSON.parse(str);
  } catch (e) {
    throw new Error(`Invalid JSON in ${name}: ${e?.message || String(e)}`);
  }
}

const serviceAccountJson = mustGetEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
const serviceAccount = safeJsonParse(serviceAccountJson, 'FIREBASE_SERVICE_ACCOUNT_JSON');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();

const allowedOrigins = (process.env.CORS_ALLOW_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

function originFromReferer(referer) {
  try {
    if (!referer) return '';
    return new URL(referer).origin;
  } catch (e) {
    return '';
  }
}

app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes('*')) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Ezee-Notify-Secret']
}));

app.options('/notifyNewSubmission', (req, res) => {
  const origin = String(req.get('Origin') || '');
  if (!allowedOrigins.includes('*')) {
    if (!isAllowedOrigin(origin)) {
      return res.sendStatus(204);
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Ezee-Notify-Secret');
  return res.sendStatus(204);
});

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.status(200).send('ok');
});

app.post('/notifyNewSubmission', async (req, res) => {
  try {
    // Best-effort abuse reduction: require the request to come from an allowed site origin.
    // Note: this is not perfect security, but it blocks casual direct calls.
    if (!allowedOrigins.includes('*')) {
      const origin = String(req.get('Origin') || '');
      const refererOrigin = originFromReferer(String(req.get('Referer') || ''));
      if (!isAllowedOrigin(origin) && !isAllowedOrigin(refererOrigin)) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    }

    const expectedSecret = process.env.EZEE_NOTIFY_SECRET || '';
    if (expectedSecret) {
      const headerSecret = String(req.get('X-Ezee-Notify-Secret') || '');
      if (headerSecret !== expectedSecret) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }

    const submissionId = String(req.body?.submissionId || '').trim();
    const clientName = String(req.body?.clientName || '').trim();
    const agentScCode = String(req.body?.agentScCode || '').trim();

    if (!submissionId) {
      return res.status(400).json({ ok: false, error: 'submissionId is required' });
    }

    const db = admin.firestore();
    const snap = await db.collection('adminDevices').where('onDuty', '==', true).get();

    const tokens = [];
    snap.forEach((doc) => {
      const t = doc.id;
      if (t) tokens.push(t);
    });

    if (tokens.length === 0) {
      return res.status(200).json({ ok: true, sent: 0, skipped: true });
    }

    const title = 'New agent submission';
    const namePart = clientName ? `: ${clientName}` : '';
    const bodyText = `Submission ${submissionId}${namePart}${agentScCode ? ` (SC ${agentScCode})` : ''}`;

    const message = {
      tokens,
      notification: { title, body: bodyText },
      data: {
        submissionId,
        clientName,
        agentScCode
      },
      webpush: {
        notification: {
          title,
          body: bodyText,
          icon: '/favicon.ico'
        },
        fcmOptions: {
          link: '/admin/dashboard.html'
        }
      }
    };

    const resp = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    resp.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const batch = db.batch();
      for (const t of invalidTokens) {
        batch.delete(db.collection('adminDevices').doc(t));
      }
      await batch.commit();
    }

    return res.status(200).json({
      ok: true,
      requested: tokens.length,
      successCount: resp.successCount,
      failureCount: resp.failureCount,
      cleanedInvalidTokens: invalidTokens.length
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`notify-sender listening on ${port}`);
});

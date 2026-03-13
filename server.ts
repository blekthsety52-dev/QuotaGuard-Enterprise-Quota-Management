import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Get Firestore instance for the specific database
const db = admin.firestore();
// Note: In some environments, you might need to specify the databaseId in settings
// but for now we'll use the default or the one configured in the environment.
// If the environment supports named databases:
// const db = admin.firestore(admin.app()); // and then use settings for databaseId

const app = express();
app.use(express.json());

// --- Quota Management Logic ---

const PLANS = {
  free: { id: 'free', name: 'Free Tier', monthlyQuota: 1000, burstAllowance: 100 },
  pro: { id: 'pro', name: 'Pro Tier', monthlyQuota: 10000, burstAllowance: 1000 },
  enterprise: { id: 'enterprise', name: 'Enterprise Tier', monthlyQuota: 100000, burstAllowance: 10000 },
};

/**
 * Deduct quota with atomic transaction and idempotency
 */
app.post('/api/quota/deduct', async (req, res) => {
  const { userId, operationType, amount, requestId } = req.body;

  if (!userId || !operationType || !amount || !requestId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const ledgerRef = db.collection('ledger').doc(requestId);
    const quotaRef = db.collection('quotas').doc(userId);
    const userRef = db.collection('users').doc(userId);

    const result = await db.runTransaction(async (t) => {
      // 1. Idempotency Check
      const ledgerDoc = await t.get(ledgerRef);
      if (ledgerDoc.exists) {
        return { status: 'ALREADY_PROCESSED', data: ledgerDoc.data() };
      }

      // 2. Get User and Plan
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) {
        throw new Error('USER_NOT_FOUND');
      }
      const userData = userDoc.data();
      const plan = PLANS[userData.planId as keyof typeof PLANS] || PLANS.free;

      // 3. Get Current Quota
      const quotaDoc = await t.get(quotaRef);
      let quotaData = quotaDoc.exists ? quotaDoc.data() : { consumed: 0, limit: plan.monthlyQuota };

      const totalLimit = plan.monthlyQuota + (plan.burstAllowance || 0);
      const newConsumed = (quotaData?.consumed || 0) + amount;

      // 4. Hard Limit Check
      if (newConsumed > totalLimit) {
        throw new Error('QUOTA_EXHAUSTED');
      }

      // 5. Update Quota
      const softLimitThreshold = plan.monthlyQuota * 0.9;
      const softLimitReached = newConsumed >= softLimitThreshold;

      t.set(quotaRef, {
        ...quotaData,
        consumed: newConsumed,
        limit: plan.monthlyQuota,
        softLimitReached,
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // 6. Record in Ledger
      const ledgerEntry = {
        id: requestId,
        userId,
        operationType,
        amount,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'success',
      };
      t.set(ledgerRef, ledgerEntry);

      return { status: 'SUCCESS', newConsumed, softLimitReached };
    });

    res.json(result);
  } catch (error: any) {
    console.error('Quota deduction failed:', error);
    const errorCode = error.message === 'QUOTA_EXHAUSTED' ? 'QUOTA_EXHAUSTED' : 'INTERNAL_ERROR';
    res.status(errorCode === 'QUOTA_EXHAUSTED' ? 403 : 500).json({ error: errorCode });
  }
});

/**
 * Get User Dashboard Data
 */
app.get('/api/quota/dashboard/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const quotaDoc = await db.collection('quotas').doc(userId).get();
    const ledgerDocs = await db.collection('ledger')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const history = ledgerDocs.docs.map(doc => doc.data());
    res.json({
      quota: quotaDoc.exists ? quotaDoc.data() : null,
      history,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// --- Vite Middleware ---

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

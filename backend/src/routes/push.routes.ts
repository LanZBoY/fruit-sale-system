import { Router } from 'express';
import type { PushSubscription } from 'web-push';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { ok, asyncHandler, AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { pushEnabled } from '../lib/push.js';

const router = Router();

// GET /push/public-key  取得 VAPID 公鑰供前端訂閱
router.get(
  '/public-key',
  asyncHandler(async (_req, res) => {
    ok(res, { enabled: pushEnabled, public_key: config.vapid.publicKey || null });
  })
);

// POST /push/subscribe  訂閱 Web Push
router.post(
  '/subscribe',
  authenticate,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Partial<PushSubscription> & { subscription?: PushSubscription };
    const sub: Partial<PushSubscription> | undefined = body.subscription || body;
    if (!sub?.endpoint) throw new AppError('VALIDATION_ERROR', '訂閱資料不正確');
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, subscription)
       VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription, user_id = EXCLUDED.user_id`,
      [req.user!.id, sub.endpoint, sub]
    );
    ok(res, { ok: true }, 201);
  })
);

// DELETE /push/subscribe  取消訂閱
router.delete(
  '/subscribe',
  authenticate,
  asyncHandler(async (req, res) => {
    const { endpoint } = (req.body ?? {}) as { endpoint?: string };
    if (endpoint) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    } else {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user!.id]);
    }
    ok(res, { ok: true });
  })
);

export default router;

import { Router } from 'express';
import type { PushSubscription } from 'web-push';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { ok, asyncHandler, AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { pushEnabled } from '../lib/push.js';
import { z, documented, envelope, ErrorSchema } from '../lib/openapi.js';

const router = Router();

// VAPID 公鑰回應
const PublicKeyResult = z.object({
  enabled: z.boolean(),
  public_key: z.string().nullable(),
});

// Web Push 訂閱物件
const SubscriptionObject = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
});

// 訂閱 body：寬鬆，允許 { subscription: {...} } 或扁平 { endpoint, keys }
// 真正的 endpoint 存在與否由 handler 業務檢查（VALIDATION_ERROR）。
const SubscribeBody = z
  .object({
    subscription: SubscriptionObject.optional(),
    endpoint: z.string().optional(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
  })
  .passthrough();

const UnsubscribeBody = z.object({ endpoint: z.string().optional() });

// GET /push/public-key  取得 VAPID 公鑰供前端訂閱（公開端點，無需認證）
router.get(
  '/public-key',
  documented({
    method: 'get',
    path: '/api/v1/push/public-key',
    tags: ['Push'],
    summary: '取得 VAPID 公鑰',
    description: '取得 Web Push 通知的 VAPID 公鑰，供前端進行推播訂閱。此端點無需認證。',
    responses: {
      200: { description: '成功取得 VAPID 公鑰', schema: envelope(PublicKeyResult) },
    },
  }),
  asyncHandler(async (_req, res) => {
    ok(res, { enabled: pushEnabled, public_key: config.vapid.publicKey || null });
  })
);

// POST /push/subscribe  訂閱 Web Push
router.post(
  '/subscribe',
  authenticate,
  documented({
    method: 'post',
    path: '/api/v1/push/subscribe',
    tags: ['Push'],
    summary: '訂閱 Web Push 通知',
    description:
      '使用者訂閱 Web Push 通知。可傳 { subscription: {...} } 或扁平的 { endpoint, keys }。需要 Bearer 授權。',
    security: true,
    request: { body: SubscribeBody },
    responses: {
      201: { description: '訂閱成功', schema: envelope(z.object({ ok: z.boolean() })) },
      400: { description: '訂閱資料不正確', schema: ErrorSchema },
      401: { description: '未授權（缺少或無效的 token）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof SubscribeBody> & Partial<PushSubscription>;
    const sub: Partial<PushSubscription> | undefined =
      (body.subscription as PushSubscription | undefined) || body;
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
  documented({
    method: 'delete',
    path: '/api/v1/push/subscribe',
    tags: ['Push'],
    summary: '取消 Web Push 訂閱',
    description:
      '使用者取消 Web Push 訂閱。可指定特定端點取消，或不指定則取消該使用者的所有訂閱。需要 Bearer 授權。',
    security: true,
    request: { body: UnsubscribeBody },
    responses: {
      200: { description: '取消訂閱成功', schema: envelope(z.object({ ok: z.boolean() })) },
      401: { description: '未授權（缺少或無效的 token）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body as z.infer<typeof UnsubscribeBody>;
    if (endpoint) {
      await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    } else {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user!.id]);
    }
    ok(res, { ok: true });
  })
);

export default router;

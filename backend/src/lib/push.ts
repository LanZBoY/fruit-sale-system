import webpush from 'web-push';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

const enabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);
if (enabled) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
} else {
  console.log('[push] 未設定 VAPID 金鑰，Web Push 推播停用');
}

export const pushEnabled = enabled;

/** 對所有出貨組已訂閱裝置發送推播 */
export async function pushToShippers(payload) {
  if (!enabled) return;
  const { rows } = await pool.query(
    `SELECT ps.subscription FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     WHERE u.role = 'shipper' AND u.is_active = TRUE`
  );
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(r.subscription, JSON.stringify(payload));
      } catch (err) {
        // 410/404：訂閱失效，移除
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [
            r.subscription.endpoint,
          ]);
        }
      }
    })
  );
}

import { inject } from 'vitest';
import request from 'supertest';

// 注意：所有 src 模組都用「動態 import」，確保 process.env.DATABASE_URL
// 在 config.js / pool.js 首次載入之前就設定好。
let appPromise;

/** 取得 supertest agent（首次呼叫會設定環境變數並載入 app） */
export async function getAgent() {
  if (!appPromise) {
    process.env.DATABASE_URL = inject('databaseUrl');
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    // VAPID 未設定 → web-push 自動停用，pushToShippers 變 no-op
    appPromise = import('../../src/app.js').then((m) => m.createApp());
  }
  return request(await appPromise);
}

/** 清空所有表並重新 seed（每個測試前呼叫，確保互相隔離） */
export async function resetDb() {
  const { pool } = await import('../../src/db/pool.js');
  await pool.query(`
    TRUNCATE users, customers, products, orders, order_items,
             shipment_status_logs, push_subscriptions
    RESTART IDENTITY CASCADE
  `);
  const { seed } = await import('../../src/db/seed.js');
  await seed();
}

const API = '/api/v1';

/** 以預設種子帳號登入，回傳 access token */
export async function login(agent, username, password) {
  const res = await agent.post(`${API}/auth/login`).send({ username, password });
  if (res.status !== 200) {
    throw new Error(`login(${username}) 失敗: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.access_token;
}

/** 種子帳號（對應 src/db/seed.js） */
export const ACCOUNTS = {
  admin: ['admin', 'admin123'],
  sales: ['sales', 'sales123'],
  shipper: ['shipper', 'shipper123'],
};

/** 取得某個商品（依名稱），方便建立訂單 */
export async function getProductByName(name) {
  const { pool } = await import('../../src/db/pool.js');
  const { rows } = await pool.query('SELECT * FROM products WHERE name = $1', [name]);
  return rows[0];
}

export { API };

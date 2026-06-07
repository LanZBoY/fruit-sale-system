import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getAgent, resetDb, login, API, ACCOUNTS } from './helpers.js';

let agent;

beforeAll(async () => {
  agent = await getAgent();
});
beforeEach(async () => {
  await resetDb();
});

describe('健康檢查', () => {
  it('GET /health → ok', async () => {
    const res = await agent.get(`${API}/health`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });
});

describe('POST /auth/login', () => {
  it('正確帳密 → 回 access/refresh token 與使用者', async () => {
    const res = await agent.post(`${API}/auth/login`).send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ username: 'admin', role: 'admin' });
    // 不應外洩密碼雜湊
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('密碼錯誤 → 401', async () => {
    const res = await agent.post(`${API}/auth/login`).send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('缺欄位 → 400 VALIDATION_ERROR', async () => {
    const res = await agent.post(`${API}/auth/login`).send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /auth/me', () => {
  it('帶 token → 回自己的資料', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('sales');
  });

  it('沒帶 token → 401', async () => {
    const res = await agent.get(`${API}/auth/me`);
    expect(res.status).toBe(401);
  });
});

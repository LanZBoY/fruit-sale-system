import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getAgent, resetDb, login, API, ACCOUNTS } from './helpers.js';

let agent;
beforeAll(async () => { agent = await getAgent(); });
beforeEach(async () => { await resetDb(); });

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// 公開回應欄位（不含 password_hash）
const PUBLIC_FIELDS = ['id', 'username', 'display_name', 'role', 'is_active', 'created_at'];

function expectNoPasswordLeak(user) {
  expect(user).not.toHaveProperty('password_hash');
  expect(user).not.toHaveProperty('password');
}

describe('GET /users（列表，限 admin）', () => {
  it('admin 可取得使用者列表，且不外洩密碼雜湊', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent.get(`${API}/users`).set(auth(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // 種子有 4 個使用者：root, admin, sales, shipper
    expect(res.body.data.length).toBe(4);

    const usernames = res.body.data.map((u) => u.username);
    expect(usernames).toEqual(expect.arrayContaining(['root', 'admin', 'sales', 'shipper']));

    for (const u of res.body.data) {
      expectNoPasswordLeak(u);
      expect(Object.keys(u).sort()).toEqual([...PUBLIC_FIELDS].sort());
    }
  });

  it('sales 角色存取列表回 403 FORBIDDEN', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.get(`${API}/users`).set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shipper 角色存取列表回 403 FORBIDDEN', async () => {
    const token = await login(agent, ...ACCOUNTS.shipper);
    const res = await agent.get(`${API}/users`).set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token 回 401 UNAUTHORIZED', async () => {
    const res = await agent.get(`${API}/users`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /users（建立，限 admin）', () => {
  it('admin 可建立新使用者，回 201 並含公開欄位、不外洩密碼', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent
      .post(`${API}/users`)
      .set(auth(token))
      .send({
        username: 'newsales',
        password: 'pw123456',
        display_name: '新業務',
        role: 'sales',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.username).toBe('newsales');
    expect(res.body.data.display_name).toBe('新業務');
    expect(res.body.data.role).toBe('sales');
    expect(res.body.data.is_active).toBe(true);
    expectNoPasswordLeak(res.body.data);

    // 新帳號可登入，驗證密碼確實有效
    const newToken = await login(agent, 'newsales', 'pw123456');
    expect(typeof newToken).toBe('string');
  });

  it('缺少欄位回 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent
      .post(`${API}/users`)
      .set(auth(token))
      .send({ username: 'incomplete', role: 'sales' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('角色不合法回 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent
      .post(`${API}/users`)
      .set(auth(token))
      .send({
        username: 'baduser',
        password: 'pw123456',
        display_name: '壞角色',
        role: 'superuser',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('帳號重複回 409 CONFLICT', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent
      .post(`${API}/users`)
      .set(auth(token))
      .send({
        username: 'sales', // 種子已存在
        password: 'pw123456',
        display_name: '重複帳號',
        role: 'sales',
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('非 admin（sales）建立使用者回 403 FORBIDDEN', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await agent
      .post(`${API}/users`)
      .set(auth(token))
      .send({
        username: 'nope',
        password: 'pw123456',
        display_name: '不可建立',
        role: 'sales',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token 回 401 UNAUTHORIZED', async () => {
    const res = await agent.post(`${API}/users`).send({
      username: 'nope',
      password: 'pw123456',
      display_name: '不可建立',
      role: 'sales',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('PUT /users/:id（編輯，限 admin）', () => {
  async function getUserByUsername(token, username) {
    const res = await agent.get(`${API}/users`).set(auth(token));
    return res.body.data.find((u) => u.username === username);
  }

  it('admin 可更新 display_name 與 role', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(token, 'sales');

    const res = await agent
      .put(`${API}/users/${target.id}`)
      .set(auth(token))
      .send({ display_name: '改名業務', role: 'shipper' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(target.id);
    expect(res.body.data.display_name).toBe('改名業務');
    expect(res.body.data.role).toBe('shipper');
    expectNoPasswordLeak(res.body.data);
  });

  it('admin 可重設密碼，新密碼可登入', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(token, 'sales');

    const res = await agent
      .put(`${API}/users/${target.id}`)
      .set(auth(token))
      .send({ password: 'brandnew99' });
    expect(res.status).toBe(200);
    expectNoPasswordLeak(res.body.data);

    const newToken = await login(agent, 'sales', 'brandnew99');
    expect(typeof newToken).toBe('string');
  });

  it('角色不合法回 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(token, 'sales');

    const res = await agent
      .put(`${API}/users/${target.id}`)
      .set(auth(token))
      .send({ role: 'ceo' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('找不到使用者回 404 NOT_FOUND', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent
      .put(`${API}/users/00000000-0000-0000-0000-000000000000`)
      .set(auth(token))
      .send({ display_name: '不存在' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('非 admin（shipper）編輯回 403 FORBIDDEN', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(adminToken, 'sales');

    const shipperToken = await login(agent, ...ACCOUNTS.shipper);
    const res = await agent
      .put(`${API}/users/${target.id}`)
      .set(auth(shipperToken))
      .send({ display_name: '不可改' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token 回 401 UNAUTHORIZED', async () => {
    const res = await agent.put(`${API}/users/1`).send({ display_name: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('PATCH /users/:id/active（停用/啟用，限 admin）', () => {
  async function getUserByUsername(token, username) {
    const res = await agent.get(`${API}/users`).set(auth(token));
    return res.body.data.find((u) => u.username === username);
  }

  it('admin 可停用其他使用者，停用後該帳號無法登入', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(token, 'sales');

    const res = await agent
      .patch(`${API}/users/${target.id}/active`)
      .set(auth(token))
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(false);
    expectNoPasswordLeak(res.body.data);

    // 停用後 sales 應無法登入（login helper 非 200 會 throw）
    await expect(login(agent, ...ACCOUNTS.sales)).rejects.toThrow();
  });

  it('admin 可重新啟用使用者', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(token, 'sales');

    await agent
      .patch(`${API}/users/${target.id}/active`)
      .set(auth(token))
      .send({ is_active: false });

    const res = await agent
      .patch(`${API}/users/${target.id}/active`)
      .set(auth(token))
      .send({ is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);

    // 重新啟用後可再次登入
    const reToken = await login(agent, ...ACCOUNTS.sales);
    expect(typeof reToken).toBe('string');
  });

  it('不可停用自己回 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const me = await getUserByUsername(token, 'admin');

    const res = await agent
      .patch(`${API}/users/${me.id}/active`)
      .set(auth(token))
      .send({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('找不到使用者回 404 NOT_FOUND', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await agent
      .patch(`${API}/users/00000000-0000-0000-0000-000000000000/active`)
      .set(auth(token))
      .send({ is_active: false });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('非 admin（sales）操作回 403 FORBIDDEN', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const target = await getUserByUsername(adminToken, 'shipper');

    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const res = await agent
      .patch(`${API}/users/${target.id}/active`)
      .set(auth(salesToken))
      .send({ is_active: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token 回 401 UNAUTHORIZED', async () => {
    const res = await agent.patch(`${API}/users/1/active`).send({ is_active: false });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

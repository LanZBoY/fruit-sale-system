import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getAgent, resetDb, login, API, ACCOUNTS } from './helpers.js';

let agent;
beforeAll(async () => { agent = await getAgent(); });
beforeEach(async () => { await resetDb(); });

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// 建立一個客戶並回傳建立後的 row（payload）
async function createCustomer(token, body = { name: '王小明', phone: '0912345678' }) {
  const res = await agent.post(`${API}/customers`).set(auth(token)).send(body);
  return res;
}

describe('POST /customers 建立客戶', () => {
  it('sales 可建立客戶，回 201 與客戶資料', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await createCustomer(token, { name: '王小明', phone: '0912345678' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: '王小明', phone: '0912345678' });
    expect(res.body.data.id).toBeDefined();
  });

  it('admin 可建立客戶，回 201', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    const res = await createCustomer(token, { name: '陳大文', phone: '0922222222' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: '陳大文', phone: '0922222222' });
  });

  it('缺少 name → 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.post(`${API}/customers`).set(auth(token)).send({ phone: '0912345678' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('缺少 phone → 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.post(`${API}/customers`).set(auth(token)).send({ name: '王小明' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('空 body → 400 VALIDATION_ERROR', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.post(`${API}/customers`).set(auth(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('shipper 不可建立客戶 → 403 FORBIDDEN', async () => {
    const token = await login(agent, ...ACCOUNTS.shipper);
    const res = await createCustomer(token);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token → 401 UNAUTHORIZED', async () => {
    const res = await agent.post(`${API}/customers`).send({ name: '王小明', phone: '0912345678' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /customers 列表/搜尋', () => {
  it('sales 可列出客戶，回陣列', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    await createCustomer(token, { name: '王小明', phone: '0912345678' });
    await createCustomer(token, { name: '陳大文', phone: '0922222222' });
    const res = await agent.get(`${API}/customers`).set(auth(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('admin 可列出客戶', async () => {
    const token = await login(agent, ...ACCOUNTS.admin);
    await createCustomer(token, { name: '王小明', phone: '0912345678' });
    const res = await agent.get(`${API}/customers`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  it('?q= 依姓名搜尋', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    await createCustomer(token, { name: '王小明', phone: '0912345678' });
    await createCustomer(token, { name: '陳大文', phone: '0922222222' });
    const res = await agent.get(`${API}/customers`).query({ q: '王小明' }).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].name).toBe('王小明');
  });

  it('?q= 依電話搜尋', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    await createCustomer(token, { name: '王小明', phone: '0912345678' });
    await createCustomer(token, { name: '陳大文', phone: '0922222222' });
    const res = await agent.get(`${API}/customers`).query({ q: '0922' }).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].phone).toBe('0922222222');
  });

  it('?q= 無相符 → 空陣列', async () => {
    const token = await login(agent, ...ACCOUNTS.sales);
    await createCustomer(token, { name: '王小明', phone: '0912345678' });
    const res = await agent.get(`${API}/customers`).query({ q: '查無此人' }).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('shipper 不可列出客戶 → 403 FORBIDDEN', async () => {
    const token = await login(agent, ...ACCOUNTS.shipper);
    const res = await agent.get(`${API}/customers`).set(auth(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token → 401 UNAUTHORIZED', async () => {
    const res = await agent.get(`${API}/customers`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /customers/:id 客戶詳情', () => {
  it('admin 可取得客戶詳情，含 orders 欄位', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const created = await createCustomer(adminToken, { name: '王小明', phone: '0912345678' });
    const id = created.body.data.id;
    const res = await agent.get(`${API}/customers/${id}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, name: '王小明', phone: '0912345678' });
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders).toEqual([]);
  });

  it('不存在的客戶 → 404 NOT_FOUND', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const res = await agent.get(`${API}/customers/00000000-0000-0000-0000-000000000000`).set(auth(adminToken));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sales 不可取得客戶詳情（僅 admin）→ 403 FORBIDDEN', async () => {
    // 先用 admin 建客戶取得 id
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const created = await createCustomer(adminToken, { name: '王小明', phone: '0912345678' });
    const id = created.body.data.id;
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.get(`${API}/customers/${id}`).set(auth(salesToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shipper 不可取得客戶詳情 → 403 FORBIDDEN', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const created = await createCustomer(adminToken, { name: '王小明', phone: '0912345678' });
    const id = created.body.data.id;
    const shipperToken = await login(agent, ...ACCOUNTS.shipper);
    const res = await agent.get(`${API}/customers/${id}`).set(auth(shipperToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token → 401 UNAUTHORIZED', async () => {
    const res = await agent.get(`${API}/customers/1`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

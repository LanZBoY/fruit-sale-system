import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getAgent, resetDb, login, getProductByName, API, ACCOUNTS } from './helpers.js';

let agent;
let salesToken, shipperToken, adminToken;
let mango; // 愛文芒果 250 / stock 100

beforeAll(async () => {
  agent = await getAgent();
});
beforeEach(async () => {
  await resetDb();
  salesToken = await login(agent, ...ACCOUNTS.sales);
  shipperToken = await login(agent, ...ACCOUNTS.shipper);
  adminToken = await login(agent, ...ACCOUNTS.admin);
  mango = await getProductByName('愛文芒果');
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

/** 由 sales 建立一張含 1 項商品的訂單，回傳 response */
async function createOrder(token = salesToken, qty = 2) {
  return agent
    .post(`${API}/orders`)
    .set(auth(token))
    .send({
      customer: { name: '陳先生', phone: '0912345678' },
      items: [{ product_id: mango.id, qty }],
    });
}

describe('POST /orders 建立訂單', () => {
  it('sales 建單 → 201，金額 = 單價 × 數量', async () => {
    const res = await createOrder(salesToken, 2);
    expect(res.status).toBe(201);
    expect(res.body.data.order_no).toMatch(/^\d{8}-\d{3}$/);
    expect(res.body.data.status).toBe('pending');
    expect(Number(res.body.data.total_amount)).toBe(250 * 2);
  });

  it('扣庫存：建單後商品庫存減少', async () => {
    await createOrder(salesToken, 3);
    const after = await getProductByName('愛文芒果');
    expect(after.stock_qty).toBe(100 - 3);
  });

  it('庫存不足 → 409 INSUFFICIENT_STOCK，且不扣庫存', async () => {
    const res = await createOrder(salesToken, 999);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    const after = await getProductByName('愛文芒果');
    expect(after.stock_qty).toBe(100); // 交易 rollback，庫存不變
  });

  it('沒有商品項目 → 400', async () => {
    const res = await agent
      .post(`${API}/orders`)
      .set(auth(salesToken))
      .send({ customer: { name: 'A', phone: '09' }, items: [] });
    expect(res.status).toBe(400);
  });

  it('shipper 不可建單 → 403', async () => {
    const res = await createOrder(shipperToken, 1);
    expect(res.status).toBe(403);
  });

  it('未登入 → 401', async () => {
    const res = await agent.post(`${API}/orders`).send({});
    expect(res.status).toBe(401);
  });
});

describe('出貨組看不到金額（RBAC，後端層級過濾）', () => {
  it('GET /orders/shipping 的回應完全不含金額欄位', async () => {
    await createOrder(salesToken, 2);
    const res = await agent.get(`${API}/orders/shipping`).set(auth(shipperToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const order = res.body.data[0];
    expect(order).toHaveProperty('order_no');
    expect(order).toHaveProperty('items');
    // 關鍵：無 total_amount / unit_price / subtotal
    expect(order.total_amount).toBeUndefined();
    expect(JSON.stringify(order)).not.toContain('total_amount');
    expect(JSON.stringify(order)).not.toContain('unit_price');
    for (const it of order.items) {
      expect(it).toHaveProperty('qty');
      expect(it.unit_price).toBeUndefined();
      expect(it.subtotal).toBeUndefined();
    }
  });

  it('shipper 取單筆訂單詳情也不含金額', async () => {
    const created = await createOrder(salesToken, 1);
    const id = created.body.data.id;
    const res = await agent.get(`${API}/orders/${id}`).set(auth(shipperToken));
    expect(res.status).toBe(200);
    expect(res.body.data.total_amount).toBeUndefined();
  });

  it('admin 取同一訂單詳情則看得到金額與明細', async () => {
    const created = await createOrder(salesToken, 1);
    const id = created.body.data.id;
    const res = await agent.get(`${API}/orders/${id}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(Number(res.body.data.total_amount)).toBe(250);
    expect(res.body.data.items[0].unit_price).toBeDefined();
  });
});

describe('PATCH /orders/:id/status 狀態流轉', () => {
  it('pending → preparing → shipped 單向推進，shipped 記錄 shipped_at', async () => {
    const created = await createOrder(salesToken, 1);
    const id = created.body.data.id;

    const r1 = await agent.patch(`${API}/orders/${id}/status`).set(auth(shipperToken)).send({ status: 'preparing' });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('preparing');

    const r2 = await agent.patch(`${API}/orders/${id}/status`).set(auth(shipperToken)).send({ status: 'shipped' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.status).toBe('shipped');
    expect(r2.body.data.shipped_at).toBeTruthy();
  });

  it('跳過中間狀態 pending → shipped → 409 INVALID_STATUS_TRANSITION', async () => {
    const created = await createOrder(salesToken, 1);
    const id = created.body.data.id;
    const res = await agent.patch(`${API}/orders/${id}/status`).set(auth(shipperToken)).send({ status: 'shipped' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('不合法狀態值 → 400', async () => {
    const created = await createOrder(salesToken, 1);
    const id = created.body.data.id;
    const res = await agent.patch(`${API}/orders/${id}/status`).set(auth(shipperToken)).send({ status: 'done' });
    expect(res.status).toBe(400);
  });
});

describe('GET /orders/mine', () => {
  it('sales 只看到自己建立的訂單', async () => {
    await createOrder(salesToken, 1);
    const res = await agent.get(`${API}/orders/mine`).set(auth(salesToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });
});

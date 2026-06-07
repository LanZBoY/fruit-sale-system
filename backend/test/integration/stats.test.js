import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getAgent, resetDb, login, API, ACCOUNTS, getProductByName } from './helpers.js';

let agent;
beforeAll(async () => { agent = await getAgent(); });
beforeEach(async () => { await resetDb(); });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// 以 sales 建立一張訂單，回傳建立結果 body.data
async function createOrder(token, customer, items) {
  const res = await agent.post(`${API}/orders`).set(auth(token)).send({ customer, items });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('GET /stats/summary', () => {
  it('admin 取得當日統計：建立訂單後 revenue / order_count 反映實際數字', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);

    const mango = await getProductByName('愛文芒果'); // 250
    const lychee = await getProductByName('玉荷包荔枝'); // 500

    // 訂單1：芒果 x2 = 500
    await createOrder(salesToken, { name: '王小明', phone: '0911111111' }, [
      { product_id: mango.id, qty: 2 },
    ]);
    // 訂單2：荔枝 x1 + 芒果 x1 = 500 + 250 = 750
    await createOrder(salesToken, { name: '陳大華', phone: '0922222222' }, [
      { product_id: lychee.id, qty: 1 },
      { product_id: mango.id, qty: 1 },
    ]);

    const res = await agent.get(`${API}/stats/summary`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.order_count).toBe(2);
    expect(d.revenue).toBe(1250); // 500 + 750
    // 新建訂單皆為 pending，尚未出貨
    expect(d.shipped_count).toBe(0);
    expect(d.pending_count).toBe(2);
    expect(d).toHaveProperty('date');
  });

  it('admin 在沒有訂單時 revenue=0、order_count=0', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const res = await agent.get(`${API}/stats/summary`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.revenue).toBe(0);
    expect(res.body.data.order_count).toBe(0);
  });

  it('admin 可指定 date 查詢過去日期（當日無訂單 → 0）', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const mango = await getProductByName('愛文芒果');
    await createOrder(salesToken, { name: '王小明', phone: '0911111111' }, [
      { product_id: mango.id, qty: 1 },
    ]);

    const res = await agent
      .get(`${API}/stats/summary`)
      .query({ date: '2020-01-01' })
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2020-01-01');
    expect(res.body.data.order_count).toBe(0);
    expect(res.body.data.revenue).toBe(0);
  });

  it('sales 角色 → 403 FORBIDDEN', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.get(`${API}/stats/summary`).set(auth(salesToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shipper 角色 → 403 FORBIDDEN', async () => {
    const shipperToken = await login(agent, ...ACCOUNTS.shipper);
    const res = await agent.get(`${API}/stats/summary`).set(auth(shipperToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token → 401 UNAUTHORIZED', async () => {
    const res = await agent.get(`${API}/stats/summary`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /stats/product-ranking', () => {
  it('admin 取得排行：依銷售金額由高到低排序，含 qty / amount', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);

    const mango = await getProductByName('愛文芒果'); // 250
    const lychee = await getProductByName('玉荷包荔枝'); // 500

    // 芒果共 5 顆 → 1250；荔枝共 1 顆 → 500
    await createOrder(salesToken, { name: '王小明', phone: '0911111111' }, [
      { product_id: mango.id, qty: 3 },
      { product_id: lychee.id, qty: 1 },
    ]);
    await createOrder(salesToken, { name: '陳大華', phone: '0922222222' }, [
      { product_id: mango.id, qty: 2 },
    ]);

    const res = await agent.get(`${API}/stats/product-ranking`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const rows = res.body.data;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);

    // 第一名應為芒果（金額較高 1250 > 500）
    expect(rows[0].product_id).toBe(mango.id);
    expect(rows[0].product_name).toBe('愛文芒果');
    expect(rows[0].qty).toBe(5);
    expect(rows[0].amount).toBe(1250);

    expect(rows[1].product_id).toBe(lychee.id);
    expect(rows[1].qty).toBe(1);
    expect(rows[1].amount).toBe(500);

    // amount 為 number 型別
    expect(typeof rows[0].amount).toBe('number');
  });

  it('admin 無訂單時回傳空陣列', async () => {
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const res = await agent.get(`${API}/stats/product-ranking`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('admin 指定 from/to 區間（過去區間無資料 → 空陣列）', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const mango = await getProductByName('愛文芒果');
    await createOrder(salesToken, { name: '王小明', phone: '0911111111' }, [
      { product_id: mango.id, qty: 1 },
    ]);

    const res = await agent
      .get(`${API}/stats/product-ranking`)
      .query({ from: '2020-01-01', to: '2020-01-31' })
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('sales 角色 → 403 FORBIDDEN', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.get(`${API}/stats/product-ranking`).set(auth(salesToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token → 401 UNAUTHORIZED', async () => {
    const res = await agent.get(`${API}/stats/product-ranking`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /stats/orders', () => {
  it('admin 取得訂單紀錄：含建立的訂單，欄位含 order_no / total_amount / status', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const mango = await getProductByName('愛文芒果');

    const created = await createOrder(
      salesToken,
      { name: '王小明', phone: '0911111111' },
      [{ product_id: mango.id, qty: 2 }]
    );

    const res = await agent.get(`${API}/stats/orders`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const rows = res.body.data;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    const o = rows[0];
    expect(o.id).toBe(created.id);
    expect(o.order_no).toBe(created.order_no);
    expect(o.status).toBe('pending');
    expect(Number(o.total_amount)).toBe(500);
  });

  it('admin 以 status 篩選只回傳符合狀態的訂單', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const mango = await getProductByName('愛文芒果');
    await createOrder(salesToken, { name: '王小明', phone: '0911111111' }, [
      { product_id: mango.id, qty: 1 },
    ]);

    // 全部都是 pending，篩 shipped 應為空
    const shippedRes = await agent
      .get(`${API}/stats/orders`)
      .query({ status: 'shipped' })
      .set(auth(adminToken));
    expect(shippedRes.status).toBe(200);
    expect(shippedRes.body.data).toEqual([]);

    // 篩 pending 應有 1 筆
    const pendingRes = await agent
      .get(`${API}/stats/orders`)
      .query({ status: 'pending' })
      .set(auth(adminToken));
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.length).toBe(1);
    expect(pendingRes.body.data[0].status).toBe('pending');
  });

  it('admin 以 from/to 過去區間篩選 → 空陣列', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const adminToken = await login(agent, ...ACCOUNTS.admin);
    const mango = await getProductByName('愛文芒果');
    await createOrder(salesToken, { name: '王小明', phone: '0911111111' }, [
      { product_id: mango.id, qty: 1 },
    ]);

    const res = await agent
      .get(`${API}/stats/orders`)
      .query({ from: '2020-01-01', to: '2020-01-31' })
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('sales 角色 → 403 FORBIDDEN', async () => {
    const salesToken = await login(agent, ...ACCOUNTS.sales);
    const res = await agent.get(`${API}/stats/orders`).set(auth(salesToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shipper 角色 → 403 FORBIDDEN', async () => {
    const shipperToken = await login(agent, ...ACCOUNTS.shipper);
    const res = await agent.get(`${API}/stats/orders`).set(auth(shipperToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('未帶 token → 401 UNAUTHORIZED', async () => {
    const res = await agent.get(`${API}/stats/orders`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { taipeiOrderDatePrefix, taipeiDayRange } from '../lib/tz.js';
import {
  emitOrderCreated,
  emitStatusChanged,
  emitInventoryUpdated,
} from '../lib/realtime.js';
import { pushToShippers } from '../lib/push.js';

const router = Router();

const NEXT_STATUS = { pending: 'preparing', preparing: 'shipped' };

async function loadOrderItems(client, orderId) {
  const { rows } = await (client || pool).query(
    'SELECT * FROM order_items WHERE order_id = $1',
    [orderId]
  );
  return rows;
}

/** 出貨組視角（無金額） */
function toShippingView(order, items) {
  return {
    id: order.id,
    order_no: order.order_no,
    status: order.status,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    created_at: order.created_at,
    shipped_at: order.shipped_at,
    items: items.map((i) => ({ product_name: i.product_name, qty: i.qty })),
  };
}

// POST /orders  建立訂單（sales）
router.post(
  '/',
  authenticate,
  authorize('sales', 'admin'),
  asyncHandler(async (req, res) => {
    const { customer, items } = req.body || {};
    if (!customer?.name || !customer?.phone) {
      throw new AppError('VALIDATION_ERROR', '請輸入客戶姓名與電話');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('VALIDATION_ERROR', '訂單需至少一項商品');
    }

    const result = await withTransaction(async (client) => {
      // 1. 客戶：沿用既有或新建
      let customerId = customer.id || null;
      if (customerId) {
        const c = await client.query('SELECT id FROM customers WHERE id = $1', [customerId]);
        if (!c.rows[0]) customerId = null;
      }
      if (!customerId) {
        const c = await client.query(
          'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id',
          [customer.name, customer.phone]
        );
        customerId = c.rows[0].id;
      }

      // 2. 驗證商品（鎖定列以避免超賣）
      const lineItems = [];
      let total = 0;
      for (const it of items) {
        if (!it.product_id || !it.qty || it.qty <= 0) {
          throw new AppError('VALIDATION_ERROR', '商品或數量不正確');
        }
        const p = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [
          it.product_id,
        ]);
        const product = p.rows[0];
        if (!product) throw new AppError('NOT_FOUND', '找不到商品');
        if (!product.is_listed) throw new AppError('VALIDATION_ERROR', `${product.name} 未上架`);
        if (product.stock_qty < it.qty) {
          throw new AppError('INSUFFICIENT_STOCK', `${product.name} 庫存不足`);
        }
        const unitPrice = it.unit_price != null ? Number(it.unit_price) : Number(product.price);
        const subtotal = unitPrice * it.qty;
        total += subtotal;
        lineItems.push({ product, qty: it.qty, unitPrice, subtotal });
      }

      // 3. 產生訂單編號 YYYYMMDD-NNN（台北日）
      const prefix = taipeiOrderDatePrefix();
      const cnt = await client.query(
        `SELECT COUNT(*)::int AS n FROM orders WHERE order_no LIKE $1`,
        [`${prefix}-%`]
      );
      const orderNo = `${prefix}-${String(cnt.rows[0].n + 1).padStart(3, '0')}`;

      // 4. 建立訂單
      const o = await client.query(
        `INSERT INTO orders
           (order_no, customer_id, customer_name, customer_phone, total_amount, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING *`,
        [orderNo, customerId, customer.name, customer.phone, total, req.user.id]
      );
      const order = o.rows[0];

      // 5. 明細 + 扣庫存
      const updatedStocks = [];
      for (const li of lineItems) {
        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, qty, unit_price, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, li.product.id, li.product.name, li.qty, li.unitPrice, li.subtotal]
        );
        const upd = await client.query(
          'UPDATE products SET stock_qty = stock_qty - $2, updated_at = now() WHERE id = $1 RETURNING id, stock_qty',
          [li.product.id, li.qty]
        );
        updatedStocks.push(upd.rows[0]);
      }

      // 6. 狀態 log
      await client.query(
        `INSERT INTO shipment_status_logs (order_id, from_status, to_status, changed_by)
         VALUES ($1, NULL, 'pending', $2)`,
        [order.id, req.user.id]
      );

      const orderItems = await loadOrderItems(client, order.id);
      return { order, orderItems, updatedStocks };
    });

    // 交易外：推播即時事件
    const { order, orderItems, updatedStocks } = result;
    emitOrderCreated({
      full: { ...order, items: orderItems },
      shipping: toShippingView(order, orderItems),
    });
    updatedStocks.forEach((s) =>
      emitInventoryUpdated({ product_id: s.id, stock_qty: s.stock_qty })
    );
    pushToShippers({
      title: '新訂單',
      body: `${order.customer_name} 的訂單 ${order.order_no}`,
      order_no: order.order_no,
    }).catch(() => {});

    ok(
      res,
      {
        id: order.id,
        order_no: order.order_no,
        status: order.status,
        total_amount: order.total_amount,
        created_at: order.created_at,
      },
      201
    );
  })
);

// GET /orders  訂單紀錄（admin，可日期/狀態篩選）
router.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { status, from, to } = req.query;
    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (from) {
      params.push(taipeiDayRange(from).start);
      where.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(taipeiDayRange(to).end);
      where.push(`created_at < $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    ok(res, rows);
  })
);

// GET /orders/mine  自己建立的訂單（sales）
router.get(
  '/mine',
  authenticate,
  authorize('sales', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT * FROM orders WHERE created_by = $1 ORDER BY created_at DESC LIMIT 200',
      [req.user.id]
    );
    ok(res, rows);
  })
);

// GET /orders/shipping  待出貨/備貨中清單（shipper，無金額）
router.get(
  '/shipping',
  authenticate,
  authorize('shipper', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT * FROM orders ORDER BY
         CASE status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT 300`
    );
    const result = [];
    for (const o of rows) {
      const items = await loadOrderItems(null, o.id);
      result.push(toShippingView(o, items));
    }
    ok(res, result);
  })
);

// GET /orders/:id  訂單詳情（admin 或 sales 自己）
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];
    if (!order) throw new AppError('NOT_FOUND', '找不到訂單');

    if (req.user.role === 'sales' && order.created_by !== req.user.id) {
      throw new AppError('FORBIDDEN', '無權查看此訂單');
    }
    if (req.user.role === 'shipper') {
      const items = await loadOrderItems(null, order.id);
      return ok(res, toShippingView(order, items));
    }

    const items = await loadOrderItems(null, order.id);
    const logs = await pool.query(
      `SELECT l.*, u.display_name AS changed_by_name
       FROM shipment_status_logs l JOIN users u ON u.id = l.changed_by
       WHERE l.order_id = $1 ORDER BY l.changed_at ASC`,
      [order.id]
    );
    ok(res, { ...order, items, status_logs: logs.rows });
  })
);

// PATCH /orders/:id/status  更新出貨狀態（shipper/admin）
router.patch(
  '/:id/status',
  authenticate,
  authorize('shipper', 'admin'),
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!['pending', 'preparing', 'shipped'].includes(status)) {
      throw new AppError('VALIDATION_ERROR', '狀態不正確');
    }

    const updated = await withTransaction(async (client) => {
      const r = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [
        req.params.id,
      ]);
      const order = r.rows[0];
      if (!order) throw new AppError('NOT_FOUND', '找不到訂單');

      // 僅允許單向推進 pending → preparing → shipped
      if (NEXT_STATUS[order.status] !== status) {
        throw new AppError('INVALID_STATUS_TRANSITION', '不允許的狀態轉換');
      }

      const shippedAt = status === 'shipped' ? new Date() : null;
      const u = await client.query(
        `UPDATE orders SET status = $2, shipped_at = COALESCE($3, shipped_at)
         WHERE id = $1 RETURNING *`,
        [order.id, status, shippedAt]
      );
      await client.query(
        `INSERT INTO shipment_status_logs (order_id, from_status, to_status, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [order.id, order.status, status, req.user.id]
      );
      return u.rows[0];
    });

    emitStatusChanged({
      order_id: updated.id,
      order_no: updated.order_no,
      status: updated.status,
      changed_at: new Date().toISOString(),
    });

    ok(res, {
      id: updated.id,
      order_no: updated.order_no,
      status: updated.status,
      shipped_at: updated.shipped_at,
    });
  })
);

export default router;

import { Router } from 'express';
import type { PoolClient } from 'pg';
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
import {
  z,
  documented,
  envelope,
  ErrorSchema,
  OrderDetailSchema,
  OrderDetailWithLogsSchema,
  OrderShippingViewSchema,
} from '../lib/openapi.js';
import type { OrderRow, OrderItemRow, ProductRow, OrderStatus, CustomerRow } from '../types.js';

const router = Router();

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing',
  preparing: 'shipped',
};

// ---- 請求 schema（單一來源：執行期驗證 + 文件）----

// 建立訂單：客戶資訊 + 至少一項商品
const CreateOrderBody = z.object({
  customer: z.object({
    id: z.string().optional(),
    name: z.string().min(1, '請輸入客戶姓名'),
    phone: z.string().min(1, '請輸入客戶電話'),
  }),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1, '缺少商品 ID'),
        qty: z.number().positive('數量必須大於 0'),
        unit_price: z.number().optional(),
      })
    )
    .min(1, '訂單需至少一項商品'),
});

// 訂單列表查詢（寬鬆：欄位皆可選，型別不 reject）
const ListOrdersQuery = z.object({
  status: z.string().optional().openapi({ description: '訂單狀態篩選：pending / preparing / shipped' }),
  from: z.string().optional().openapi({ description: '起始日期（台北時區，含此日）' }),
  to: z.string().optional().openapi({ description: '結束日期（台北時區，不含此日）' }),
});

// 訂單 ID path 參數
const OrderIdParams = z.object({ id: z.string() });

// 更新出貨狀態
const UpdateStatusBody = z.object({
  status: z.enum(['pending', 'preparing', 'shipped']),
});

// 建立訂單回應
const CreateOrderResult = z.object({
  id: z.string(),
  order_no: z.string(),
  status: z.enum(['pending', 'preparing', 'shipped']),
  total_amount: z.number(),
  created_at: z.string().openapi({ format: 'date-time' }),
});

// 更新狀態回應
const UpdateStatusResult = z.object({
  id: z.string(),
  order_no: z.string(),
  status: z.enum(['pending', 'preparing', 'shipped']),
  shipped_at: z.string().openapi({ format: 'date-time' }).nullable(),
});

async function loadOrderItems(
  client: PoolClient | null,
  orderId: string
): Promise<OrderItemRow[]> {
  const { rows } = await (client || pool).query<OrderItemRow>(
    'SELECT * FROM order_items WHERE order_id = $1',
    [orderId]
  );
  return rows;
}

/** 出貨組視角（無金額） */
function toShippingView(order: OrderRow, items: OrderItemRow[]) {
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
  documented({
    method: 'post',
    path: '/api/v1/orders',
    tags: ['Orders'],
    summary: '建立訂單',
    description: 'Sales 和 admin 可建立訂單。需要客戶資訊（姓名、電話）和至少一項商品。',
    security: true,
    request: { body: CreateOrderBody },
    responses: {
      201: { description: '訂單建立成功', schema: envelope(CreateOrderResult) },
      400: { description: '驗證錯誤', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（非 sales 或 admin）', schema: ErrorSchema },
      404: { description: '商品不存在', schema: ErrorSchema },
      409: { description: '庫存不足', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { customer, items } = req.body as z.infer<typeof CreateOrderBody>;

    const result = await withTransaction(async (client) => {
      // 1. 客戶：沿用既有或新建
      let customerId: string | null = customer.id || null;
      if (customerId) {
        const c = await client.query<Pick<CustomerRow, 'id'>>(
          'SELECT id FROM customers WHERE id = $1',
          [customerId]
        );
        if (!c.rows[0]) customerId = null;
      }
      if (!customerId) {
        const c = await client.query<Pick<CustomerRow, 'id'>>(
          'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id',
          [customer.name, customer.phone]
        );
        customerId = c.rows[0].id;
      }

      // 2. 驗證商品（鎖定列以避免超賣）
      const lineItems: Array<{
        product: ProductRow;
        qty: number;
        unitPrice: number;
        subtotal: number;
      }> = [];
      let total = 0;
      for (const it of items) {
        if (!it.product_id || !it.qty || it.qty <= 0) {
          throw new AppError('VALIDATION_ERROR', '商品或數量不正確');
        }
        const p = await client.query<ProductRow>('SELECT * FROM products WHERE id = $1 FOR UPDATE', [
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
      const cnt = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM orders WHERE order_no LIKE $1`,
        [`${prefix}-%`]
      );
      const orderNo = `${prefix}-${String(cnt.rows[0].n + 1).padStart(3, '0')}`;

      // 4. 建立訂單
      const o = await client.query<OrderRow>(
        `INSERT INTO orders
           (order_no, customer_id, customer_name, customer_phone, total_amount, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING *`,
        [orderNo, customerId, customer.name, customer.phone, total, req.user!.id]
      );
      const order = o.rows[0];

      // 5. 明細 + 扣庫存
      const updatedStocks: Array<Pick<ProductRow, 'id' | 'stock_qty'>> = [];
      for (const li of lineItems) {
        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, product_name, qty, unit_price, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, li.product.id, li.product.name, li.qty, li.unitPrice, li.subtotal]
        );
        const upd = await client.query<Pick<ProductRow, 'id' | 'stock_qty'>>(
          'UPDATE products SET stock_qty = stock_qty - $2, updated_at = now() WHERE id = $1 RETURNING id, stock_qty',
          [li.product.id, li.qty]
        );
        updatedStocks.push(upd.rows[0]);
      }

      // 6. 狀態 log
      await client.query(
        `INSERT INTO shipment_status_logs (order_id, from_status, to_status, changed_by)
         VALUES ($1, NULL, 'pending', $2)`,
        [order.id, req.user!.id]
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
  documented({
    method: 'get',
    path: '/api/v1/orders',
    tags: ['Orders'],
    summary: '查詢訂單紀錄',
    description: 'Admin 限定。可按狀態、日期範圍篩選，最多回傳 500 筆。',
    security: true,
    request: { query: ListOrdersQuery },
    responses: {
      200: { description: '訂單列表', schema: envelope(z.array(OrderDetailSchema)) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（非 admin）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const where: string[] = [];
    const params: unknown[] = [];
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
    const { rows } = await pool.query<OrderRow>(
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
  documented({
    method: 'get',
    path: '/api/v1/orders/mine',
    tags: ['Orders'],
    summary: '查詢自己建立的訂單',
    description: 'Sales 和 admin 可查詢自己建立的訂單，最多回傳 200 筆。',
    security: true,
    responses: {
      200: { description: '訂單列表', schema: envelope(z.array(OrderDetailSchema)) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（非 sales 或 admin）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<OrderRow>(
      'SELECT * FROM orders WHERE created_by = $1 ORDER BY created_at DESC LIMIT 200',
      [req.user!.id]
    );
    ok(res, rows);
  })
);

// GET /orders/shipping  待出貨/備貨中清單（shipper，無金額）
router.get(
  '/shipping',
  authenticate,
  authorize('shipper', 'admin'),
  documented({
    method: 'get',
    path: '/api/v1/orders/shipping',
    tags: ['Orders'],
    summary: '查詢待出貨清單',
    description:
      'Shipper 和 admin 限定。回應不含金額欄位（total_amount、unit_price），最多回傳 300 筆，按狀態優先級（pending → preparing → shipped）排序。',
    security: true,
    responses: {
      200: {
        description: '待出貨訂單列表（無金額資訊）',
        schema: envelope(z.array(OrderShippingViewSchema)),
      },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（非 shipper 或 admin）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<OrderRow>(
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
  documented({
    method: 'get',
    path: '/api/v1/orders/{id}',
    tags: ['Orders'],
    summary: '查詢訂單詳情',
    description:
      'Admin 可查看所有訂單；Sales 僅可查看自己建立的訂單；Shipper 可查看但不含金額欄位。',
    security: true,
    request: { params: OrderIdParams },
    responses: {
      200: {
        description: '訂單詳情（admin/sales 含金額及狀態日誌；shipper 無金額）',
        schema: envelope(z.union([OrderDetailWithLogsSchema, OrderShippingViewSchema])),
      },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '無權查看此訂單', schema: ErrorSchema },
      404: { description: '訂單不存在', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [
      req.params.id,
    ]);
    const order = rows[0];
    if (!order) throw new AppError('NOT_FOUND', '找不到訂單');

    if (req.user!.role === 'sales' && order.created_by !== req.user!.id) {
      throw new AppError('FORBIDDEN', '無權查看此訂單');
    }
    if (req.user!.role === 'shipper') {
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
  documented({
    method: 'patch',
    path: '/api/v1/orders/{id}/status',
    tags: ['Orders'],
    summary: '更新訂單出貨狀態',
    description: 'Shipper 和 admin 限定。僅允許單向推進：pending → preparing → shipped。',
    security: true,
    request: { params: OrderIdParams, body: UpdateStatusBody },
    responses: {
      200: { description: '狀態更新成功', schema: envelope(UpdateStatusResult) },
      400: { description: '驗證錯誤（狀態值不正確）', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（非 shipper 或 admin）', schema: ErrorSchema },
      404: { description: '訂單不存在', schema: ErrorSchema },
      409: { description: '不允許的狀態轉換', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { status } = req.body as z.infer<typeof UpdateStatusBody>;
    const nextStatus = status as OrderStatus;

    const updated = await withTransaction(async (client) => {
      const r = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [
        req.params.id,
      ]);
      const order = r.rows[0];
      if (!order) throw new AppError('NOT_FOUND', '找不到訂單');

      // 僅允許單向推進 pending → preparing → shipped
      if (NEXT_STATUS[order.status] !== nextStatus) {
        throw new AppError('INVALID_STATUS_TRANSITION', '不允許的狀態轉換');
      }

      const shippedAt = nextStatus === 'shipped' ? new Date() : null;
      const u = await client.query<OrderRow>(
        `UPDATE orders SET status = $2, shipped_at = COALESCE($3, shipped_at)
         WHERE id = $1 RETURNING *`,
        [order.id, nextStatus, shippedAt]
      );
      await client.query(
        `INSERT INTO shipment_status_logs (order_id, from_status, to_status, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [order.id, order.status, nextStatus, req.user!.id]
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

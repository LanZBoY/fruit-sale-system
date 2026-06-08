import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { taipeiDayRange, taipeiToday } from '../lib/tz.js';
import { z, documented, envelope, ErrorSchema, OrderDetailSchema } from '../lib/openapi.js';
import type { OrderRow, OrderStatus } from '../types.js';

const router = Router();

type SummaryRow = {
  revenue: number;
  order_count: number;
  shipped_count: number;
  pending_count: number;
};

type ProductRankingRow = {
  product_id: string;
  product_name: string;
  qty: number;
  amount: number;
};

// 統計查詢 query schema 一律寬鬆（欄位 optional、不 reject 不合法值）
const SummaryQuery = z.object({
  date: z.string().optional().openapi({ description: '查詢日期 YYYY-MM-DD，預設台北時間當天' }),
});

const RankingQuery = z.object({
  from: z.string().optional().openapi({ description: '開始日期 YYYY-MM-DD，預設台北時間當天' }),
  to: z.string().optional().openapi({ description: '結束日期 YYYY-MM-DD，預設為 from' }),
});

const OrdersQuery = z.object({
  from: z.string().optional().openapi({ description: '開始日期 YYYY-MM-DD，未提供則無下限' }),
  to: z.string().optional().openapi({ description: '結束日期 YYYY-MM-DD，未提供則無上限' }),
  status: z
    .string()
    .optional()
    .openapi({ description: '訂單狀態篩選，可選值：pending / preparing / shipped（不合法值將被忽略）' }),
});

// 回應 schema（僅文件用）
const SummaryResult = z.object({
  date: z.string(),
  revenue: z.number(),
  order_count: z.number().int(),
  shipped_count: z.number().int(),
  pending_count: z.number().int(),
});

const ProductRankingItem = z.object({
  product_id: z.string(),
  product_name: z.string(),
  qty: z.number().int(),
  amount: z.number(),
});

// GET /stats/summary?date=YYYY-MM-DD  當日營收、訂單數
router.get(
  '/summary',
  authenticate,
  authorize('admin'),
  documented({
    method: 'get',
    path: '/api/v1/stats/summary',
    tags: ['Stats'],
    summary: '當日營收與訂單統計',
    description: '取得指定日期的營收、訂單數、出貨數及待處理訂單數。僅 admin 可訪問。',
    security: true,
    request: { query: SummaryQuery },
    responses: {
      200: { description: '成功取得統計資料', schema: envelope(SummaryResult) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '禁止訪問（非 admin）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { date: dateQuery } = req.query as z.infer<typeof SummaryQuery>;
    const date = dateQuery || taipeiToday();
    const { start, end } = taipeiDayRange(date);
    const { rows } = await pool.query<SummaryRow>(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS revenue,
         COUNT(*)::int AS order_count,
         COUNT(*) FILTER (WHERE status = 'shipped')::int AS shipped_count,
         COUNT(*) FILTER (WHERE status IN ('pending','preparing'))::int AS pending_count
       FROM orders WHERE created_at >= $1 AND created_at < $2`,
      [start, end]
    );
    const r = rows[0];
    ok(res, {
      date,
      revenue: Number(r.revenue),
      order_count: r.order_count,
      shipped_count: r.shipped_count,
      pending_count: r.pending_count,
    });
  })
);

// GET /stats/product-ranking?from=&to=  商品銷售排行
router.get(
  '/product-ranking',
  authenticate,
  authorize('admin'),
  documented({
    method: 'get',
    path: '/api/v1/stats/product-ranking',
    tags: ['Stats'],
    summary: '商品銷售排行',
    description: '依銷售金額排序，取得指定日期範圍內的商品銷售排行。僅 admin 可訪問。',
    security: true,
    request: { query: RankingQuery },
    responses: {
      200: { description: '成功取得商品排行資料', schema: envelope(z.array(ProductRankingItem)) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '禁止訪問（非 admin）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { from: fromQuery, to: toQuery } = req.query as z.infer<typeof RankingQuery>;
    const from = fromQuery || taipeiToday();
    const to = toQuery || from;
    const start = taipeiDayRange(from).start;
    const end = taipeiDayRange(to).end;
    const { rows } = await pool.query<ProductRankingRow>(
      `SELECT oi.product_id, oi.product_name,
              SUM(oi.qty)::int AS qty,
              SUM(oi.subtotal) AS amount
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at >= $1 AND o.created_at < $2
       GROUP BY oi.product_id, oi.product_name
       ORDER BY amount DESC`,
      [start, end]
    );
    ok(res, rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  })
);

// GET /stats/orders?from=&to=&status=  訂單紀錄查詢
router.get(
  '/orders',
  authenticate,
  authorize('admin'),
  documented({
    method: 'get',
    path: '/api/v1/stats/orders',
    tags: ['Stats'],
    summary: '訂單紀錄查詢',
    description: '依條件查詢訂單紀錄（最多回傳 500 筆）。僅 admin 可訪問。',
    security: true,
    request: { query: OrdersQuery },
    responses: {
      200: { description: '成功取得訂單紀錄', schema: envelope(z.array(OrderDetailSchema)) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '禁止訪問（非 admin）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { from, to, status } = req.query as z.infer<typeof OrdersQuery>;
    const where: string[] = [];
    const params: unknown[] = [];
    if (from) {
      params.push(taipeiDayRange(from).start);
      where.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(taipeiDayRange(to).end);
      where.push(`created_at < $${params.length}`);
    }
    if (status) {
      params.push(status as OrderStatus);
      where.push(`status = $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query<OrderRow>(
      `SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    ok(res, rows);
  })
);

export default router;

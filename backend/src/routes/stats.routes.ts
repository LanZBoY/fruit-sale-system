import { Router } from 'express';
import { pool } from '../db/pool.js';
import { ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { taipeiDayRange, taipeiToday } from '../lib/tz.js';

const router = Router();

// GET /stats/summary?date=YYYY-MM-DD  當日營收、訂單數
router.get(
  '/summary',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const date = req.query.date || taipeiToday();
    const { start, end } = taipeiDayRange(date);
    const { rows } = await pool.query(
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
  asyncHandler(async (req, res) => {
    const from = req.query.from || taipeiToday();
    const to = req.query.to || from;
    const start = taipeiDayRange(from).start;
    const end = taipeiDayRange(to).end;
    const { rows } = await pool.query(
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
  asyncHandler(async (req, res) => {
    const { from, to, status } = req.query;
    const where = [];
    const params = [];
    if (from) {
      params.push(taipeiDayRange(from).start);
      where.push(`created_at >= $${params.length}`);
    }
    if (to) {
      params.push(taipeiDayRange(to).end);
      where.push(`created_at < $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT 500`,
      params
    );
    ok(res, rows);
  })
);

export default router;

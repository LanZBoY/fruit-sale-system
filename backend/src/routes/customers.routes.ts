import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// GET /customers?q=  搜尋客戶（姓名/電話）
router.get(
  '/',
  authenticate,
  authorize('sales', 'admin'),
  asyncHandler(async (req, res) => {
    const q = req.query.q;
    let rows;
    if (q) {
      const r = await pool.query(
        `SELECT * FROM customers WHERE name ILIKE $1 OR phone ILIKE $1
         ORDER BY created_at DESC LIMIT 50`,
        [`%${q}%`]
      );
      rows = r.rows;
    } else {
      const r = await pool.query('SELECT * FROM customers ORDER BY created_at DESC LIMIT 50');
      rows = r.rows;
    }
    ok(res, rows);
  })
);

// POST /customers  建立客戶
router.post(
  '/',
  authenticate,
  authorize('sales', 'admin'),
  asyncHandler(async (req, res) => {
    const { name, phone } = req.body || {};
    if (!name || !phone) throw new AppError('VALIDATION_ERROR', '請輸入客戶姓名與電話');
    const { rows } = await pool.query(
      'INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING *',
      [name, phone]
    );
    ok(res, rows[0], 201);
  })
);

// GET /customers/:id  客戶詳情 + 歷史訂單（admin）
router.get(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到客戶');
    const orders = await pool.query(
      `SELECT id, order_no, total_amount, status, created_at
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    ok(res, { ...rows[0], orders: orders.rows });
  })
);

export default router;

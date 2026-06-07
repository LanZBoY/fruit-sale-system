import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// ---- 圖片上傳設定 ----
fs.mkdirSync(config.uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// 出貨組可見：移除金額欄位
function toShipperView(p) {
  return { id: p.id, name: p.name, image_url: p.image_url, stock_qty: p.stock_qty, is_listed: p.is_listed };
}

// GET /products  （sales/admin 含金額；shipper 用 ?for=shipping 無金額）
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    // 出貨組一律拿無金額版本（雙保險：後端過濾，非僅前端隱藏）
    const forShipping = req.user.role === 'shipper' || req.query.for === 'shipping';

    const where = [];
    const params = [];
    if (req.query.listed === 'true') where.push('is_listed = TRUE');
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`name ILIKE $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM products ${clause} ORDER BY is_listed DESC, name ASC`,
      params
    );
    ok(res, forShipping ? rows.map(toShipperView) : rows);
  })
);

// GET /products/:id
router.get(
  '/:id',
  authenticate,
  authorize('sales', 'admin'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到商品');
    ok(res, rows[0]);
  })
);

// POST /products
router.post(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { name, price = 0, stock_qty = 0, is_listed = true, image_url = null } = req.body || {};
    if (!name) throw new AppError('VALIDATION_ERROR', '請輸入商品名稱');
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, stock_qty, is_listed, image_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, price, stock_qty, is_listed, image_url]
    );
    ok(res, rows[0], 201);
  })
);

// PUT /products/:id
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { name, price, stock_qty, is_listed, image_url } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE products SET
         name = COALESCE($2, name),
         price = COALESCE($3, price),
         stock_qty = COALESCE($4, stock_qty),
         is_listed = COALESCE($5, is_listed),
         image_url = COALESCE($6, image_url),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, price, stock_qty, is_listed, image_url]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到商品');
    ok(res, rows[0]);
  })
);

// PATCH /products/:id/listing  切換上架
router.patch(
  '/:id/listing',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { is_listed } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE products SET is_listed = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, Boolean(is_listed)]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到商品');
    ok(res, rows[0]);
  })
);

// POST /products/:id/image  上傳圖片
router.post(
  '/:id/image',
  authenticate,
  authorize('admin'),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('VALIDATION_ERROR', '請選擇圖片檔');
    const imageUrl = `${config.publicBaseUrl}/uploads/${req.file.filename}`;
    const { rows } = await pool.query(
      `UPDATE products SET image_url = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, imageUrl]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到商品');
    ok(res, rows[0]);
  })
);

export default router;

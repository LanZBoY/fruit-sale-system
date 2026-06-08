import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { z, documented, envelope, ErrorSchema, ProductSchema } from '../lib/openapi.js';
import type { ProductRow } from '../types.js';

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
function toShipperView(p: Pick<ProductRow, 'id' | 'name' | 'image_url' | 'stock_qty' | 'is_listed'>) {
  return { id: p.id, name: p.name, image_url: p.image_url, stock_qty: p.stock_qty, is_listed: p.is_listed };
}

// ---- 共用 schema ----
const IdParams = z.object({ id: z.string() });

const ListProductsQuery = z.object({
  listed: z.string().optional().openapi({ description: '篩選已上架商品（傳 true）' }),
  q: z.string().optional().openapi({ description: '商品名稱搜尋關鍵字' }),
  for: z.string().optional().openapi({ description: '若指定 shipping，回傳出貨員視圖（無金額欄位）' }),
});

const CreateProductBody = z.object({
  name: z.string().min(1, '請輸入商品名稱'),
  price: z.number().optional(),
  stock_qty: z.number().int().optional(),
  is_listed: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
});

const UpdateProductBody = z.object({
  name: z.string().min(1, '商品名稱不可為空').optional(),
  price: z.number().optional(),
  stock_qty: z.number().int().optional(),
  is_listed: z.boolean().optional(),
  image_url: z.string().nullable().optional(),
});

const ToggleListingBody = z.object({
  is_listed: z.boolean(),
});

// GET /products  （sales/admin 含金額；shipper 用 ?for=shipping 無金額）
router.get(
  '/',
  authenticate,
  documented({
    method: 'get',
    path: '/api/v1/products',
    tags: ['Products'],
    summary: '列出商品',
    description:
      '取得商品清單。已驗證使用者可見所有商品欄位；出貨員角色會移除金額相關欄位（price）。支持篩選：listed=true 查詢已上架商品，q=keyword 搜尋名稱，for=shipping 回傳出貨員視圖。',
    security: true,
    request: { query: ListProductsQuery },
    responses: {
      200: { description: '商品清單（已驗證）', schema: envelope(z.array(ProductSchema)) },
      401: { description: '未授權', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    // 出貨組一律拿無金額版本（雙保險：後端過濾，非僅前端隱藏）
    const forShipping = req.user!.role === 'shipper' || req.query.for === 'shipping';

    const where: string[] = [];
    const params: string[] = [];
    if (req.query.listed === 'true') where.push('is_listed = TRUE');
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`name ILIKE $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query<ProductRow>(
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
  documented({
    method: 'get',
    path: '/api/v1/products/{id}',
    tags: ['Products'],
    summary: '取得商品詳細資訊',
    description: '取得指定商品的完整資訊。需 sales 或 admin 角色。',
    security: true,
    request: { params: IdParams },
    responses: {
      200: { description: '商品詳細資訊', schema: envelope(ProductSchema) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（需要 sales 或 admin 角色）', schema: ErrorSchema },
      404: { description: '商品不存在', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<ProductRow>('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到商品');
    ok(res, rows[0]);
  })
);

// POST /products
router.post(
  '/',
  authenticate,
  authorize('admin'),
  documented({
    method: 'post',
    path: '/api/v1/products',
    tags: ['Products'],
    summary: '建立商品',
    description: '建立新商品。僅 admin 可操作。',
    security: true,
    request: { body: CreateProductBody },
    responses: {
      201: { description: '商品已建立', schema: envelope(ProductSchema) },
      400: { description: '驗證錯誤', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（需要 admin 角色）', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { name, price = 0, stock_qty = 0, is_listed = true, image_url = null } =
      req.body as z.infer<typeof CreateProductBody>;
    const { rows } = await pool.query<ProductRow>(
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
  documented({
    method: 'put',
    path: '/api/v1/products/{id}',
    tags: ['Products'],
    summary: '更新商品',
    description: '更新商品資訊。僅 admin 可操作。所有欄位皆為選填，未提供的欄位保留原值。',
    security: true,
    request: { params: IdParams, body: UpdateProductBody },
    responses: {
      200: { description: '商品已更新', schema: envelope(ProductSchema) },
      400: { description: '驗證錯誤', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（需要 admin 角色）', schema: ErrorSchema },
      404: { description: '商品不存在', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { name, price, stock_qty, is_listed, image_url } =
      req.body as z.infer<typeof UpdateProductBody>;
    const { rows } = await pool.query<ProductRow>(
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
  documented({
    method: 'patch',
    path: '/api/v1/products/{id}/listing',
    tags: ['Products'],
    summary: '切換商品上架狀態',
    description: '更新商品的上架/下架狀態。僅 admin 可操作。',
    security: true,
    request: { params: IdParams, body: ToggleListingBody },
    responses: {
      200: { description: '上架狀態已更新', schema: envelope(ProductSchema) },
      400: { description: '驗證錯誤', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（需要 admin 角色）', schema: ErrorSchema },
      404: { description: '商品不存在', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { is_listed } = req.body as z.infer<typeof ToggleListingBody>;
    const { rows } = await pool.query<ProductRow>(
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
  documented({
    method: 'post',
    path: '/api/v1/products/{id}/image',
    tags: ['Products'],
    summary: '上傳商品圖片',
    description:
      '上傳商品圖片檔案。僅 admin 可操作。支持 JPEG、PNG 等標準圖片格式，檔案大小限制 5MB。',
    security: true,
    request: {
      params: z.object({ id: z.string() }),
      body: z.object({ image: z.any().openapi({ type: 'string', format: 'binary' }) }),
      bodyContentType: 'multipart/form-data',
    },
    responses: {
      200: { description: '圖片已上傳', schema: envelope(ProductSchema) },
      400: { description: '驗證錯誤（缺少圖片檔或格式不符）', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足（需要 admin 角色）', schema: ErrorSchema },
      404: { description: '商品不存在', schema: ErrorSchema },
    },
  }),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('VALIDATION_ERROR', '請選擇圖片檔');
    const imageUrl = `${config.publicBaseUrl}/uploads/${req.file.filename}`;
    const { rows } = await pool.query<ProductRow>(
      `UPDATE products SET image_url = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, imageUrl]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到商品');
    ok(res, rows[0]);
  })
);

export default router;

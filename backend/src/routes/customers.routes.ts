import { Router } from 'express';
import { pool } from '../db/pool.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { z, documented, envelope, ErrorSchema } from '../lib/openapi.js';
import type { CustomerRow, OrderRow } from '../types.js';

const router = Router();

// 客戶基本資料
const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  created_at: z.string().openapi({ format: 'date-time' }),
});

// 客戶詳情：含歷史訂單
const CustomerWithOrdersSchema = CustomerSchema.extend({
  orders: z.array(
    z.object({
      id: z.string(),
      order_no: z.string(),
      total_amount: z.number(),
      status: z.enum(['pending', 'preparing', 'shipped']),
      created_at: z.string().openapi({ format: 'date-time' }),
    })
  ),
});

const ListCustomersQuery = z.object({
  q: z.string().optional().openapi({ description: '搜尋關鍵字（客戶姓名或電話）' }),
});

// GET /customers?q=  搜尋客戶（姓名/電話）
router.get(
  '/',
  authenticate,
  authorize('sales', 'admin'),
  documented({
    method: 'get',
    path: '/api/v1/customers',
    tags: ['Customers'],
    summary: '搜尋客戶',
    description: '搜尋客戶（姓名/電話）。需要登入且具有 sales 或 admin 角色。',
    security: true,
    request: { query: ListCustomersQuery },
    responses: {
      200: { description: '客戶列表', schema: envelope(z.array(CustomerSchema)) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const q = req.query.q as string | undefined;
    let rows: CustomerRow[];
    if (q) {
      const r = await pool.query<CustomerRow>(
        `SELECT * FROM customers WHERE name ILIKE $1 OR phone ILIKE $1
         ORDER BY created_at DESC LIMIT 50`,
        [`%${q}%`]
      );
      rows = r.rows;
    } else {
      const r = await pool.query<CustomerRow>(
        'SELECT * FROM customers ORDER BY created_at DESC LIMIT 50'
      );
      rows = r.rows;
    }
    ok(res, rows);
  })
);

const CreateCustomerBody = z.object({
  name: z.string().min(1, '請輸入客戶姓名'),
  phone: z.string().min(1, '請輸入客戶電話'),
});

// POST /customers  建立客戶
router.post(
  '/',
  authenticate,
  authorize('sales', 'admin'),
  documented({
    method: 'post',
    path: '/api/v1/customers',
    tags: ['Customers'],
    summary: '建立客戶',
    description: '建立新客戶。需要登入且具有 sales 或 admin 角色。',
    security: true,
    request: { body: CreateCustomerBody },
    responses: {
      201: { description: '客戶已建立', schema: envelope(CustomerSchema) },
      400: { description: '驗證錯誤（缺少必填欄位）', schema: ErrorSchema },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { name, phone } = req.body as z.infer<typeof CreateCustomerBody>;
    const { rows } = await pool.query<CustomerRow>(
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
  documented({
    method: 'get',
    path: '/api/v1/customers/{id}',
    tags: ['Customers'],
    summary: '客戶詳情及歷史訂單',
    description: '取得客戶詳情及其歷史訂單。僅 admin 可訪問。',
    security: true,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: '客戶詳情', schema: envelope(CustomerWithOrdersSchema) },
      401: { description: '未授權', schema: ErrorSchema },
      403: { description: '權限不足', schema: ErrorSchema },
      404: { description: '客戶不存在', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<CustomerRow>(
      'SELECT * FROM customers WHERE id = $1',
      [req.params.id]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到客戶');
    const orders = await pool.query<
      Pick<OrderRow, 'id' | 'order_no' | 'total_amount' | 'status' | 'created_at'>
    >(
      `SELECT id, order_no, total_amount, status, created_at
       FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );
    ok(res, { ...rows[0], orders: orders.rows });
  })
);

export default router;

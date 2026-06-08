import { Router } from 'express';
import { pool } from '../db/pool.js';
import { hashPassword } from '../lib/auth.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { z, documented, envelope, ErrorSchema } from '../lib/openapi.js';
import type { Role, UserRow } from '../types.js';

const router = Router();

const ROLES: Role[] = ['sales', 'shipper', 'admin'];

function publicUser(
  u: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role' | 'is_active' | 'created_at'>
) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    is_active: u.is_active,
    created_at: u.created_at,
  };
}

// 使用者管理視角：含啟用狀態與建立時間（與 PublicUser 不同，故就近定義）
const UserView = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string(),
  role: z.enum(['sales', 'shipper', 'admin']),
  is_active: z.boolean(),
  created_at: z.string().openapi({ format: 'date-time' }),
});

const CreateUserBody = z.object({
  username: z.string().min(1, '請輸入帳號'),
  password: z.string().min(1, '請輸入密碼'),
  display_name: z.string().min(1, '請輸入顯示名稱'),
  role: z.enum(['sales', 'shipper', 'admin']),
});

const UpdateUserBody = z.object({
  display_name: z.string().min(1, '顯示名稱不可為空').optional(),
  role: z.enum(['sales', 'shipper', 'admin']).optional(),
  password: z.string().min(1, '密碼不可為空').optional(),
});

const ToggleActiveBody = z.object({
  is_active: z.boolean(),
});

const IdParams = z.object({ id: z.string() });

// GET /users
router.get(
  '/',
  authenticate,
  authorize('admin'),
  documented({
    method: 'get',
    path: '/api/v1/users',
    tags: ['Users'],
    summary: '列出所有使用者',
    description: '取得系統中所有使用者的列表。僅 admin 可存取。',
    security: true,
    responses: {
      200: { description: '使用者列表取得成功', schema: envelope(z.array(UserView)) },
      401: { description: '未授權 - 缺少或無效的 token', schema: ErrorSchema },
      403: { description: '禁止存取 - 非 admin 使用者', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<UserRow>('SELECT * FROM users ORDER BY created_at ASC');
    ok(res, rows.map(publicUser));
  })
);

// POST /users  建立（指定角色）
router.post(
  '/',
  authenticate,
  authorize('admin'),
  documented({
    method: 'post',
    path: '/api/v1/users',
    tags: ['Users'],
    summary: '建立新使用者',
    description: '新建一個使用者帳號並指定角色。僅 admin 可存取。',
    security: true,
    request: { body: CreateUserBody },
    responses: {
      201: { description: '使用者建立成功', schema: envelope(UserView) },
      400: { description: '請求錯誤 - 欄位不完整或角色不正確', schema: ErrorSchema },
      401: { description: '未授權 - 缺少或無效的 token', schema: ErrorSchema },
      403: { description: '禁止存取 - 非 admin 使用者', schema: ErrorSchema },
      409: { description: '衝突 - 帳號已存在', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { username, password, display_name, role } = req.body as z.infer<typeof CreateUserBody>;

    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows[0]) throw new AppError('CONFLICT', '帳號已存在');

    const hash = await hashPassword(password);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (username, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [username, hash, display_name, role]
    );
    ok(res, publicUser(rows[0]), 201);
  })
);

// PUT /users/:id  編輯（display_name / role / 重設密碼）
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  documented({
    method: 'put',
    path: '/api/v1/users/{id}',
    tags: ['Users'],
    summary: '編輯使用者',
    description: '編輯使用者的顯示名稱、角色或重設密碼。僅 admin 可存取。所有欄位為選填。',
    security: true,
    request: { params: IdParams, body: UpdateUserBody },
    responses: {
      200: { description: '使用者更新成功', schema: envelope(UserView) },
      400: { description: '請求錯誤 - 角色不正確', schema: ErrorSchema },
      401: { description: '未授權 - 缺少或無效的 token', schema: ErrorSchema },
      403: { description: '禁止存取 - 非 admin 使用者', schema: ErrorSchema },
      404: { description: '找不到該使用者', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { display_name, role, password } = req.body as z.infer<typeof UpdateUserBody>;

    const passwordHash = password ? await hashPassword(password) : null;
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         role = COALESCE($3, role),
         password_hash = COALESCE($4, password_hash)
       WHERE id = $1 RETURNING *`,
      [req.params.id, display_name, role, passwordHash]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到使用者');
    ok(res, publicUser(rows[0]));
  })
);

// PATCH /users/:id/active  啟用/停用
router.patch(
  '/:id/active',
  authenticate,
  authorize('admin'),
  documented({
    method: 'patch',
    path: '/api/v1/users/{id}/active',
    tags: ['Users'],
    summary: '切換使用者啟用狀態',
    description: '啟用或停用使用者帳號。僅 admin 可存取。Admin 無法停用自己的帳號。',
    security: true,
    request: { params: IdParams, body: ToggleActiveBody },
    responses: {
      200: { description: '使用者狀態更新成功', schema: envelope(UserView) },
      400: { description: '請求錯誤 - 無法停用自己', schema: ErrorSchema },
      401: { description: '未授權 - 缺少或無效的 token', schema: ErrorSchema },
      403: { description: '禁止存取 - 非 admin 使用者', schema: ErrorSchema },
      404: { description: '找不到該使用者', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { is_active } = req.body as z.infer<typeof ToggleActiveBody>;
    if (req.params.id === req.user!.id && is_active === false) {
      throw new AppError('VALIDATION_ERROR', '不可停用自己');
    }
    const { rows } = await pool.query<UserRow>(
      'UPDATE users SET is_active = $2 WHERE id = $1 RETURNING *',
      [req.params.id, Boolean(is_active)]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到使用者');
    ok(res, publicUser(rows[0]));
  })
);

export default router;

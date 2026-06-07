import { Router } from 'express';
import { pool } from '../db/pool.js';
import { hashPassword } from '../lib/auth.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';
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

// GET /users
router.get(
  '/',
  authenticate,
  authorize('admin'),
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
  asyncHandler(async (req, res) => {
    const { username, password, display_name, role } = (req.body ?? {}) as {
      username?: string;
      password?: string;
      display_name?: string;
      role?: string;
    };
    if (!username || !password || !display_name || !role) {
      throw new AppError('VALIDATION_ERROR', '欄位不完整');
    }
    if (!ROLES.includes(role as Role)) throw new AppError('VALIDATION_ERROR', '角色不正確');

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
  asyncHandler(async (req, res) => {
    const { display_name, role, password } = (req.body ?? {}) as {
      display_name?: string;
      role?: string;
      password?: string;
    };
    if (role && !ROLES.includes(role as Role)) throw new AppError('VALIDATION_ERROR', '角色不正確');

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
  asyncHandler(async (req, res) => {
    const { is_active } = (req.body ?? {}) as { is_active?: boolean };
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

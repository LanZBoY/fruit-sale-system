import { Router } from 'express';
import { pool } from '../db/pool.js';
import { hashPassword } from '../lib/auth.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

const ROLES = ['sales', 'shipper', 'admin'];

function publicUser(u) {
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
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
    ok(res, rows.map(publicUser));
  })
);

// POST /users  建立（指定角色）
router.post(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const { username, password, display_name, role } = req.body || {};
    if (!username || !password || !display_name || !role) {
      throw new AppError('VALIDATION_ERROR', '欄位不完整');
    }
    if (!ROLES.includes(role)) throw new AppError('VALIDATION_ERROR', '角色不正確');

    const exists = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists.rows[0]) throw new AppError('CONFLICT', '帳號已存在');

    const hash = await hashPassword(password);
    const { rows } = await pool.query(
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
    const { display_name, role, password } = req.body || {};
    if (role && !ROLES.includes(role)) throw new AppError('VALIDATION_ERROR', '角色不正確');

    const passwordHash = password ? await hashPassword(password) : null;
    const { rows } = await pool.query(
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
    const { is_active } = req.body || {};
    if (req.params.id === req.user.id && is_active === false) {
      throw new AppError('VALIDATION_ERROR', '不可停用自己');
    }
    const { rows } = await pool.query(
      'UPDATE users SET is_active = $2 WHERE id = $1 RETURNING *',
      [req.params.id, Boolean(is_active)]
    );
    if (!rows[0]) throw new AppError('NOT_FOUND', '找不到使用者');
    ok(res, publicUser(rows[0]));
  })
);

export default router;

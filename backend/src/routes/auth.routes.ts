import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/auth.js';
import { AppError, ok, asyncHandler } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import type { UserRow } from '../types.js';

const router = Router();

function publicUser(u: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'>) {
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
}

// POST /auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    if (!username || !password) {
      throw new AppError('VALIDATION_ERROR', '請輸入帳號與密碼');
    }
    const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      throw new AppError('UNAUTHORIZED', '帳號或密碼錯誤');
    }
    if (!user.is_active) throw new AppError('FORBIDDEN', '帳號已停用');

    ok(res, {
      access_token: signAccessToken(user),
      refresh_token: signRefreshToken(user),
      user: publicUser(user),
    });
  })
);

// POST /auth/refresh
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refresh_token } = (req.body ?? {}) as { refresh_token?: string };
    if (!refresh_token) throw new AppError('VALIDATION_ERROR', '缺少 refresh_token');
    let payload;
    try {
      payload = verifyRefreshToken(refresh_token);
    } catch {
      throw new AppError('UNAUTHORIZED', 'refresh token 無效或已過期');
    }
    const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const user = rows[0];
    if (!user || !user.is_active) throw new AppError('UNAUTHORIZED', '帳號不存在或已停用');

    ok(res, {
      access_token: signAccessToken(user),
      refresh_token: signRefreshToken(user),
      user: publicUser(user),
    });
  })
);

// POST /auth/logout（無狀態：由前端丟棄 token）
router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    ok(res, { ok: true });
  })
);

// GET /auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    ok(res, { user: publicUser(req.user!) });
  })
);

export default router;

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
import { z, documented, envelope, ErrorSchema, PublicUserSchema } from '../lib/openapi.js';
import type { UserRow } from '../types.js';

const router = Router();

function publicUser(u: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'>) {
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role };
}

// 登入回應：access/refresh token + 使用者
const AuthResult = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: PublicUserSchema,
});

const LoginBody = z.object({
  username: z.string().min(1, '請輸入帳號'),
  password: z.string().min(1, '請輸入密碼'),
});

// POST /auth/login
router.post(
  '/login',
  documented({
    method: 'post',
    path: '/api/v1/auth/login',
    tags: ['Auth'],
    summary: '登入取得 token',
    request: { body: LoginBody },
    responses: {
      200: { description: '登入成功', schema: envelope(AuthResult) },
      400: { description: '欄位驗證失敗', schema: ErrorSchema },
      401: { description: '帳號或密碼錯誤', schema: ErrorSchema },
      403: { description: '帳號已停用', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as z.infer<typeof LoginBody>;
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

const RefreshBody = z.object({ refresh_token: z.string().min(1, '缺少 refresh_token') });

// POST /auth/refresh
router.post(
  '/refresh',
  documented({
    method: 'post',
    path: '/api/v1/auth/refresh',
    tags: ['Auth'],
    summary: '以 refresh token 換新 token',
    request: { body: RefreshBody },
    responses: {
      200: { description: '成功', schema: envelope(AuthResult) },
      400: { description: '缺少 refresh_token', schema: ErrorSchema },
      401: { description: 'refresh token 無效或已過期', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    const { refresh_token } = req.body as z.infer<typeof RefreshBody>;
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
  documented({
    method: 'post',
    path: '/api/v1/auth/logout',
    tags: ['Auth'],
    summary: '登出（無狀態，由前端丟棄 token）',
    responses: {
      200: { description: '成功', schema: envelope(z.object({ ok: z.boolean() })) },
    },
  }),
  asyncHandler(async (_req, res) => {
    ok(res, { ok: true });
  })
);

// GET /auth/me
router.get(
  '/me',
  authenticate,
  documented({
    method: 'get',
    path: '/api/v1/auth/me',
    tags: ['Auth'],
    summary: '取得目前登入使用者',
    security: true,
    responses: {
      200: { description: '成功', schema: envelope(z.object({ user: PublicUserSchema })) },
      401: { description: '未授權', schema: ErrorSchema },
    },
  }),
  asyncHandler(async (req, res) => {
    ok(res, { user: publicUser(req.user!) });
  })
);

export default router;

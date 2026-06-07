import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';
import { pool } from '../db/pool.js';
import type { AuthUser, Role } from '../types.js';

/** 驗證 Bearer access token，掛 req.user */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('UNAUTHORIZED', '缺少授權 token');

    const payload = verifyAccessToken(token);
    // 確認帳號仍存在且啟用
    const { rows } = await pool.query<AuthUser>(
      'SELECT id, username, display_name, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) throw new AppError('UNAUTHORIZED', '帳號不存在或已停用');

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('UNAUTHORIZED', 'token 無效或已過期'));
  }
}

/** 角色守衛：authorize('admin') / authorize('shipper','admin') */
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('UNAUTHORIZED'));
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new AppError('FORBIDDEN', '權限不足'));
    }
    next();
  };
}

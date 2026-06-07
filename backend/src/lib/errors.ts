import type { Request, Response, NextFunction, RequestHandler } from 'express';

// 統一錯誤碼（對應後端規格 §7）
export const ErrorCodes: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  INSUFFICIENT_STOCK: 409,
  INVALID_STATUS_TRANSITION: 409,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
};

export class AppError extends Error {
  code: string;
  status: number;

  constructor(code: string, message?: string) {
    super(message || code);
    this.code = code;
    this.status = ErrorCodes[code] ?? 400;
  }
}

/** 統一回應格式 */
export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function fail(
  res: Response,
  code: string,
  message?: string,
  status?: number
): Response {
  return res
    .status(status ?? ErrorCodes[code] ?? 400)
    .json({ error: { code, message: message ?? code } });
}

// Express 錯誤處理 middleware
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response {
  if (err instanceof AppError) {
    return fail(res, err.code, err.message, err.status);
  }
  console.error('[error]', err);
  return fail(res, 'INTERNAL', '伺服器發生錯誤', 500);
}

// 包裝 async route，自動 catch
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

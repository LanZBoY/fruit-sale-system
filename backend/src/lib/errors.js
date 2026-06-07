// 統一錯誤碼（對應後端規格 §7）
export const ErrorCodes = {
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
  constructor(code, message) {
    super(message || code);
    this.code = code;
    this.status = ErrorCodes[code] || 400;
  }
}

/** 統一回應格式 */
export function ok(res, data, status = 200) {
  return res.status(status).json({ data });
}

export function fail(res, code, message, status) {
  return res
    .status(status || ErrorCodes[code] || 400)
    .json({ error: { code, message: message || code } });
}

// Express 錯誤處理 middleware
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return fail(res, err.code, err.message, err.status);
  }
  console.error('[error]', err);
  return fail(res, 'INTERNAL', '伺服器發生錯誤', 500);
}

// 包裝 async route，自動 catch
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

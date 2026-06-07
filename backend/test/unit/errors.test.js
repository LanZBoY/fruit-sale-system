import { describe, it, expect, vi } from 'vitest';
import {
  AppError,
  ErrorCodes,
  ok,
  fail,
  errorHandler,
  asyncHandler,
} from '../../src/lib/errors.js';

/** 假的 Express res：紀錄 status / json */
function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('AppError', () => {
  it('依錯誤碼對應到正確的 HTTP status', () => {
    expect(new AppError('NOT_FOUND').status).toBe(404);
    expect(new AppError('FORBIDDEN').status).toBe(403);
    expect(new AppError('INSUFFICIENT_STOCK').status).toBe(409);
  });

  it('未知錯誤碼預設為 400', () => {
    expect(new AppError('WHATEVER').status).toBe(400);
  });

  it('沒給 message 時用 code 當訊息', () => {
    expect(new AppError('NOT_FOUND').message).toBe('NOT_FOUND');
    expect(new AppError('NOT_FOUND', '找不到').message).toBe('找不到');
  });
});

describe('ok / fail 回應格式', () => {
  it('ok 回 { data }，預設 200', () => {
    const res = makeRes();
    ok(res, { id: 1 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ data: { id: 1 } });
  });

  it('ok 可指定 status', () => {
    const res = makeRes();
    ok(res, { id: 1 }, 201);
    expect(res.statusCode).toBe(201);
  });

  it('fail 回 { error: { code, message } }，status 依 code 推斷', () => {
    const res = makeRes();
    fail(res, 'NOT_FOUND', '找不到資源');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: '找不到資源' } });
  });
});

describe('errorHandler middleware', () => {
  it('AppError → 以其 code/status 回應', () => {
    const res = makeRes();
    errorHandler(new AppError('FORBIDDEN', '權限不足'), {}, res, () => {});
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('非 AppError → 500 INTERNAL（並吞掉 log）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = makeRes();
    errorHandler(new Error('boom'), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    spy.mockRestore();
  });
});

describe('asyncHandler', () => {
  it('handler 正常時不呼叫 next', async () => {
    const next = vi.fn();
    const wrapped = asyncHandler(async (req, res) => res.json({ ok: true }));
    const res = makeRes();
    await wrapped({}, res, next);
    expect(res.body).toEqual({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('handler reject 時把錯誤交給 next(err)', async () => {
    const next = vi.fn();
    const err = new AppError('VALIDATION_ERROR');
    const wrapped = asyncHandler(async () => {
      throw err;
    });
    await wrapped({}, makeRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('同步 throw 不會被 asyncHandler 接住（會直接拋出）', () => {
    // fn 同步 throw 時，會在 Promise.resolve(fn(...)) 之前就拋出，
    // 因此 .catch(next) 接不到 —— 這類同步錯誤由 Express 自身的 try/catch 處理。
    const next = vi.fn();
    const wrapped = asyncHandler(() => {
      throw new AppError('CONFLICT');
    });
    expect(() => wrapped({}, makeRes(), next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('ErrorCodes 對照表', () => {
  it('涵蓋規格定義的錯誤碼', () => {
    expect(ErrorCodes.UNAUTHORIZED).toBe(401);
    expect(ErrorCodes.VALIDATION_ERROR).toBe(400);
    expect(ErrorCodes.INTERNAL).toBe(500);
  });
});

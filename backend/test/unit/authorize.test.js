import { describe, it, expect, vi } from 'vitest';
import { authorize } from '../../src/middleware/auth.js';
import { AppError } from '../../src/lib/errors.js';

function run(guard, req) {
  const next = vi.fn();
  guard(req, {}, next);
  return next;
}

describe('authorize 角色守衛', () => {
  it('角色符合 → 放行（next 無參數）', () => {
    const next = run(authorize('admin'), { user: { role: 'admin' } });
    expect(next).toHaveBeenCalledWith();
  });

  it('多角色其一符合 → 放行', () => {
    const next = run(authorize('shipper', 'admin'), { user: { role: 'shipper' } });
    expect(next).toHaveBeenCalledWith();
  });

  it('角色不符 → FORBIDDEN(403)', () => {
    const next = run(authorize('admin'), { user: { role: 'sales' } });
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
  });

  it('沒有 req.user → UNAUTHORIZED(401)', () => {
    const next = run(authorize('admin'), {});
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it('未指定角色 → 任何登入者皆放行', () => {
    const next = run(authorize(), { user: { role: 'sales' } });
    expect(next).toHaveBeenCalledWith();
  });
});

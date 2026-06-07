import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/lib/auth.js';

const user = { id: 'u-1', role: 'sales', display_name: '王銷售' };

describe('密碼雜湊（argon2）', () => {
  it('雜湊後可驗證成功，錯誤密碼失敗', async () => {
    const hash = await hashPassword('s3cret');
    expect(hash).toMatch(/^\$argon2/);
    expect(await verifyPassword(hash, 's3cret')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
});

describe('JWT access / refresh', () => {
  it('access token 簽發後可驗證，並帶 sub/role', () => {
    const token = signAccessToken(user);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('u-1');
    expect(payload.role).toBe('sales');
    expect(payload.typ).toBe('access');
  });

  it('refresh token 不能被當成 access token 驗證', () => {
    const refresh = signRefreshToken(user);
    expect(() => verifyAccessToken(refresh)).toThrow();
  });

  it('access token 不能被當成 refresh token 驗證', () => {
    const access = signAccessToken(user);
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it('亂改過的 token 驗證失敗', () => {
    const token = signAccessToken(user) + 'tampered';
    expect(() => verifyAccessToken(token)).toThrow();
  });
});

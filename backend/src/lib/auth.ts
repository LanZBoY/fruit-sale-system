import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { config } from '../config.js';
import type { Role, AccessTokenPayload, RefreshTokenPayload } from '../types.js';

type SignableUser = { id: string; role: Role; display_name: string };

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

export function signAccessToken(user: SignableUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.display_name, typ: 'access' },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl } as jwt.SignOptions
  );
}

export function signRefreshToken(user: Pick<SignableUser, 'id' | 'role'>): string {
  return jwt.sign(
    { sub: user.id, role: user.role, typ: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl } as jwt.SignOptions
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as AccessTokenPayload;
  if (payload.typ !== 'access') throw new Error('not an access token');
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
  if (payload.typ !== 'refresh') throw new Error('not a refresh token');
  return payload;
}

import jwt from 'jsonwebtoken';
import argon2 from 'argon2';
import { config } from '../config.js';

export function hashPassword(plain) {
  return argon2.hash(plain);
}

export function verifyPassword(hash, plain) {
  return argon2.verify(hash, plain);
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.display_name, typ: 'access' },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl }
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, typ: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl }
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwt.accessSecret);
  if (payload.typ !== 'access') throw new Error('not an access token');
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.jwt.refreshSecret);
  if (payload.typ !== 'refresh') throw new Error('not a refresh token');
  return payload;
}

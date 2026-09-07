import jwt from 'jsonwebtoken';
import { env } from './env';

export interface SessionTokenPayload {
  userId: string;
}

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
      return { userId: String((decoded as Record<string, unknown>).userId) };
    }
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = 'session';

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

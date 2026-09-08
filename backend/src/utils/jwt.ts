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

// SameSite is a "site" (registrable domain) check, not a full-origin one, so
// localhost:5173 <-> localhost:4000 count as same-site in dev and 'lax' works fine. A real
// deployment with the frontend and API on different registrable domains needs
// COOKIE_SAME_SITE=none (which requires `secure: true`, i.e. HTTPS on both ends) or the
// browser will silently drop the cookie on cross-origin requests and every authenticated
// call will 401. See .env.example and README.md.
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: env.cookieSameSite,
  secure: env.isProduction || env.cookieSameSite === 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

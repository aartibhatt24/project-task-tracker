import { Request, Response } from 'express';
import { loginSchema } from '../validators/authValidators';
import { authenticate } from '../services/authService';
import { SESSION_COOKIE_NAME, sessionCookieOptions, signSessionToken } from '../utils/jwt';

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const user = await authenticate(email, password);
  const token = signSessionToken({ userId: user.id });
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions);
  res.json({ user });
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, { ...sessionCookieOptions, maxAge: undefined });
  res.status(204).send();
}

export async function me(req: Request, res: Response) {
  res.json({ user: req.user });
}

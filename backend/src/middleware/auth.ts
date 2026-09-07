import { NextFunction, Request, Response } from 'express';
import { Role } from '../domain/constants';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../utils/jwt';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Loads the current user fresh from the database on every request. The JWT only proves
 * *who* the caller is (a user id); it never carries a role claim the client could have kept
 * around after a role change, so authorization always reflects the user's current state.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    next(Errors.unauthenticated());
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    next(Errors.unauthenticated('Session is invalid or expired.'));
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    next(Errors.unauthenticated('Session is invalid or expired.'));
    return;
  }

  req.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
  };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(Errors.unauthenticated());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(Errors.forbidden(`This action requires role: ${roles.join(' or ')}.`));
      return;
    }
    next();
  };
}

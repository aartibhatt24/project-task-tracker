import bcrypt from 'bcryptjs';
import { Role } from '../domain/constants';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

function toPublicUser(user: { id: string; name: string; email: string; role: string }): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
}

export async function authenticate(email: string, password: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw Errors.badRequest('INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw Errors.badRequest('INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  return toPublicUser(user);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}

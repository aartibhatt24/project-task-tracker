import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';

const publicSelect = { id: true, name: true, email: true, role: true } as const;

export async function listUsers() {
  return prisma.user.findMany({ select: publicSelect, orderBy: { name: 'asc' } });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user) throw Errors.notFound('User not found.');
  return user;
}

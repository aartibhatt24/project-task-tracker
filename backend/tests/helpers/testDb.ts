import '../../src/utils/env'; // ensures DATABASE_URL is loaded from .env.test before PrismaClient reads it
import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient();

// Deletes in FK-safe order (children before parents).
export async function resetDb() {
  await testPrisma.alertDismissal.deleteMany();
  await testPrisma.taskHistory.deleteMany();
  await testPrisma.taskDependency.deleteMany();
  await testPrisma.taskAssignee.deleteMany();
  await testPrisma.task.deleteMany();
  await testPrisma.projectMember.deleteMany();
  await testPrisma.project.deleteMany();
  await testPrisma.user.deleteMany();
}

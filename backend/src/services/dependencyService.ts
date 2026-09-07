import { AuthenticatedUser } from '../middleware/auth';
import { validateDependency } from '../domain/dependencies';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { assertTaskAccessible } from './taskService';

export async function addDependency(
  actor: AuthenticatedUser,
  blockedTaskId: string,
  blockerTaskId: string,
) {
  const blockedTask = await assertTaskAccessible(actor, blockedTaskId);

  const blockerTask = await prisma.task.findUnique({ where: { id: blockerTaskId } });
  if (!blockerTask) {
    throw Errors.badRequest('BLOCKER_NOT_FOUND', 'Blocker task not found.');
  }

  const result = validateDependency(
    blockerTaskId,
    blockedTaskId,
    blockerTask.projectId,
    blockedTask.projectId,
  );
  if (!result.legal) {
    throw Errors.badRequest(result.code, result.reason);
  }

  const existing = await prisma.taskDependency.findUnique({
    where: { blockerTaskId_blockedTaskId: { blockerTaskId, blockedTaskId } },
  });
  if (existing) {
    throw Errors.conflict('DEPENDENCY_EXISTS', 'This dependency already exists.');
  }

  return prisma.taskDependency.create({ data: { blockerTaskId, blockedTaskId } });
}

export async function listDependencies(actor: AuthenticatedUser, taskId: string) {
  await assertTaskAccessible(actor, taskId);
  const [blockedBy, blocks] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { blockedTaskId: taskId },
      include: { blockerTask: { select: { id: true, title: true, status: true } } },
    }),
    prisma.taskDependency.findMany({
      where: { blockerTaskId: taskId },
      include: { blockedTask: { select: { id: true, title: true, status: true } } },
    }),
  ]);
  return {
    blockedBy: blockedBy.map((d) => d.blockerTask),
    blocks: blocks.map((d) => d.blockedTask),
  };
}

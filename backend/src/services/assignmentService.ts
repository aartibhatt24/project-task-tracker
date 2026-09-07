import { AuthenticatedUser } from '../middleware/auth';
import { computeAssigneeDiff } from '../domain/assignment';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { recordHistoryMany } from './historyService';
import { assertTaskAccessible } from './taskService';

/**
 * Replaces a task's assignee set with `desiredUserIds`. Every id must be a current member
 * of the task's project (PROJECT_SPEC.md 1.6); the whole request is rejected atomically if
 * any id is not eligible, since this is a direct single-task operation (bulk assignment,
 * built later, evaluates each *task* independently but still applies this same rule per
 * task via this exact function).
 */
export async function setTaskAssignees(
  actor: AuthenticatedUser,
  taskId: string,
  desiredUserIds: string[],
) {
  const task = await assertTaskAccessible(actor, taskId);

  const uniqueDesired = [...new Set(desiredUserIds)];

  if (uniqueDesired.length > 0) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: task.projectId, userId: { in: uniqueDesired } },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    const ineligible = uniqueDesired.filter((id) => !memberIds.has(id));
    if (ineligible.length > 0) {
      throw Errors.badRequest(
        'NOT_PROJECT_MEMBER',
        `The following users are not members of this task's project and cannot be assigned: ${ineligible.join(', ')}.`,
      );
    }
  }

  const currentAssignees = await prisma.taskAssignee.findMany({
    where: { taskId },
    select: { userId: true },
  });
  const { toAdd, toRemove } = computeAssigneeDiff(
    currentAssignees.map((a) => a.userId),
    uniqueDesired,
  );

  await prisma.$transaction(async (tx) => {
    if (toRemove.length > 0) {
      await tx.taskAssignee.deleteMany({ where: { taskId, userId: { in: toRemove } } });
    }
    if (toAdd.length > 0) {
      await tx.taskAssignee.createMany({
        data: toAdd.map((userId) => ({ taskId, userId })),
      });
    }
    await recordHistoryMany(tx, [
      ...toAdd.map((userId) => ({
        taskId,
        actorId: actor.id,
        type: 'ASSIGNED' as const,
        newValue: userId,
      })),
      ...toRemove.map((userId) => ({
        taskId,
        actorId: actor.id,
        type: 'UNASSIGNED' as const,
        oldValue: userId,
      })),
    ]);
  });

  return prisma.taskAssignee.findMany({
    where: { taskId },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
}

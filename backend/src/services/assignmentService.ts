import { Prisma, PrismaClient, Task } from '@prisma/client';
import { AuthenticatedUser } from '../middleware/auth';
import { computeAssigneeDiff } from '../domain/assignment';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { recordHistoryMany } from './historyService';
import { assertTaskAccessible } from './taskService';

type TxClient = PrismaClient | Prisma.TransactionClient;

/**
 * Core assignee-set logic shared by the single-task endpoint and bulk operations. Every id
 * in `desiredUserIds` must currently be a member of the task's project or the whole change
 * is rejected (see docs/decisions.md #13). Runs against whichever client/transaction is
 * passed in.
 */
export async function applyAssigneeChange(
  tx: TxClient,
  actor: AuthenticatedUser,
  task: Task,
  desiredUserIds: string[],
) {
  const uniqueDesired = [...new Set(desiredUserIds)];

  if (uniqueDesired.length > 0) {
    const members = await tx.projectMember.findMany({
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

  const currentAssignees = await tx.taskAssignee.findMany({
    where: { taskId: task.id },
    select: { userId: true },
  });
  const { toAdd, toRemove } = computeAssigneeDiff(
    currentAssignees.map((a) => a.userId),
    uniqueDesired,
  );

  if (toRemove.length > 0) {
    await tx.taskAssignee.deleteMany({ where: { taskId: task.id, userId: { in: toRemove } } });
  }
  if (toAdd.length > 0) {
    await tx.taskAssignee.createMany({
      data: toAdd.map((userId) => ({ taskId: task.id, userId })),
    });
  }
  await recordHistoryMany(tx, [
    ...toAdd.map((userId) => ({
      taskId: task.id,
      actorId: actor.id,
      type: 'ASSIGNED' as const,
      newValue: userId,
    })),
    ...toRemove.map((userId) => ({
      taskId: task.id,
      actorId: actor.id,
      type: 'UNASSIGNED' as const,
      oldValue: userId,
    })),
  ]);

  return tx.taskAssignee.findMany({
    where: { taskId: task.id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
  });
}

export async function setTaskAssignees(
  actor: AuthenticatedUser,
  taskId: string,
  desiredUserIds: string[],
) {
  const task = await assertTaskAccessible(actor, taskId);
  return prisma.$transaction((tx) => applyAssigneeChange(tx, actor, task, desiredUserIds));
}

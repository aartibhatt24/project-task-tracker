import { Prisma, PrismaClient, Task } from '@prisma/client';
import { AuthenticatedUser } from '../middleware/auth';
import { Status } from '../domain/constants';
import { requiresBlockerCheck, validateTransition } from '../domain/lifecycle';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { assertTaskAccessible } from './taskService';
import { recordHistory } from './historyService';

type TxClient = PrismaClient | Prisma.TransactionClient;

async function hasUnfinishedBlockers(tx: TxClient, taskId: string): Promise<boolean> {
  const blockers = await tx.taskDependency.findMany({
    where: { blockedTaskId: taskId },
    include: { blockerTask: { select: { status: true } } },
  });
  return blockers.some((dep) => dep.blockerTask.status !== 'DONE');
}

/**
 * Core status-change logic shared by the single-task endpoint and bulk operations: validates
 * the transition via the domain lifecycle table, runs the blocker check when moving to DONE,
 * updates the task, and writes history — all against whichever client/transaction is passed
 * in, so bulk can wrap a task's full set of changes in one atomic transaction while reusing
 * the exact same rule-checking as the single-task path.
 */
export async function applyStatusChange(
  tx: TxClient,
  actor: AuthenticatedUser,
  task: Task,
  targetStatus: Status,
): Promise<Task> {
  const currentStatus = task.status as Status;
  const blockedFromStatus = task.blockedFromStatus as Status | null;

  const result = validateTransition(currentStatus, targetStatus, blockedFromStatus);
  if (!result.legal) {
    throw Errors.invalidTransition(result.reason);
  }

  if (requiresBlockerCheck(targetStatus)) {
    const blocked = await hasUnfinishedBlockers(tx, task.id);
    if (blocked) {
      throw Errors.invalidTransition(
        'This task cannot be marked DONE while it has unfinished blockers.',
      );
    }
  }

  const updated = await tx.task.update({
    where: { id: task.id },
    data: { status: targetStatus, blockedFromStatus: result.nextBlockedFromStatus },
  });

  await recordHistory(tx, {
    taskId: task.id,
    actorId: actor.id,
    type: 'STATUS_CHANGE',
    field: 'status',
    oldValue: currentStatus,
    newValue: targetStatus,
  });

  return updated;
}

export async function updateTaskStatus(
  user: AuthenticatedUser,
  taskId: string,
  targetStatus: Status,
) {
  const task = await assertTaskAccessible(user, taskId);
  return prisma.$transaction((tx) => applyStatusChange(tx, user, task, targetStatus));
}

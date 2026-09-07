import { AuthenticatedUser } from '../middleware/auth';
import { Status } from '../domain/constants';
import { requiresBlockerCheck, validateTransition } from '../domain/lifecycle';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { assertTaskAccessible } from './taskService';
import { recordHistory } from './historyService';

async function hasUnfinishedBlockers(taskId: string): Promise<boolean> {
  const blockers = await prisma.taskDependency.findMany({
    where: { blockedTaskId: taskId },
    include: { blockerTask: { select: { status: true } } },
  });
  return blockers.some((dep) => dep.blockerTask.status !== 'DONE');
}

export async function updateTaskStatus(
  user: AuthenticatedUser,
  taskId: string,
  targetStatus: Status,
) {
  const task = await assertTaskAccessible(user, taskId);
  const currentStatus = task.status as Status;
  const blockedFromStatus = task.blockedFromStatus as Status | null;

  const result = validateTransition(currentStatus, targetStatus, blockedFromStatus);
  if (!result.legal) {
    throw Errors.invalidTransition(result.reason);
  }

  if (requiresBlockerCheck(targetStatus)) {
    const blocked = await hasUnfinishedBlockers(taskId);
    if (blocked) {
      throw Errors.invalidTransition(
        'This task cannot be marked DONE while it has unfinished blockers.',
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        status: targetStatus,
        blockedFromStatus: result.nextBlockedFromStatus,
      },
    });

    await recordHistory(tx, {
      taskId,
      actorId: user.id,
      type: 'STATUS_CHANGE',
      field: 'status',
      oldValue: currentStatus,
      newValue: targetStatus,
    });

    return updated;
  });
}

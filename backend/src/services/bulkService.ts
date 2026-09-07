import { AuthenticatedUser } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { applyAssigneeChange } from './assignmentService';
import { applyStatusChange } from './lifecycleService';
import { applyTaskFieldUpdate } from './taskService';
import { assertProjectAccessible } from './projectService';
import { BulkUpdateInput } from '../validators/bulkValidators';

export interface BulkSuccess {
  taskId: string;
}
export interface BulkFailure {
  taskId: string;
  code: string;
  reason: string;
}
export interface BulkResult {
  successful: BulkSuccess[];
  failed: BulkFailure[];
}

/**
 * Applies `changes` to each task in `taskIds` independently (PROJECT_SPEC.md 1.8: one
 * invalid task must never block the others). Each task's full set of requested changes runs
 * inside its own transaction, calling the exact same domain-backed apply* functions the
 * single-task endpoints use — so bulk can never enforce different rules than a single edit.
 * A failure on one task rolls back only that task's transaction and is recorded with a
 * machine-readable code + human reason; it never touches any other task.
 */
export async function bulkUpdateTasks(
  actor: AuthenticatedUser,
  input: BulkUpdateInput,
): Promise<BulkResult> {
  const successful: BulkSuccess[] = [];
  const failed: BulkFailure[] = [];

  for (const taskId of input.taskIds) {
    try {
      await prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({ where: { id: taskId } });
        if (!task) {
          throw new AppError(404, 'NOT_FOUND', 'Task not found.');
        }

        // Same visibility rule as every other task operation, evaluated per task.
        await assertProjectAccessible(actor, task.projectId);

        let current = task;

        if (input.changes.status !== undefined) {
          current = await applyStatusChange(tx, actor, current, input.changes.status);
        }

        if (input.changes.assigneeIds !== undefined) {
          await applyAssigneeChange(tx, actor, current, input.changes.assigneeIds);
        }

        if (input.changes.dueDate !== undefined) {
          current = await applyTaskFieldUpdate(tx, actor, current, {
            dueDate: input.changes.dueDate ? new Date(input.changes.dueDate) : null,
          });
        }
      });

      successful.push({ taskId });
    } catch (err) {
      if (err instanceof AppError) {
        failed.push({ taskId, code: err.code, reason: err.message });
      } else {
        failed.push({
          taskId,
          code: 'INTERNAL_ERROR',
          reason: err instanceof Error ? err.message : 'Unknown error.',
        });
      }
    }
  }

  return { successful, failed };
}

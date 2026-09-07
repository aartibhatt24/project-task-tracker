import { AuthenticatedUser } from '../middleware/auth';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';

/**
 * An alert is an overdue task (dueDate < now AND status != DONE) that the current user is
 * assigned to, and that has not been dismissed *for its current due date*. Dismissing a
 * task snapshots the due date it was dismissed at (AlertDismissal.dismissedDueDate); if the
 * due date later changes, the snapshot no longer matches, so the alert becomes eligible
 * again automatically (PROJECT_SPEC.md 1.12 / 10).
 *
 * The final "does the dismissal still apply" comparison happens in application code rather
 * than the SQL WHERE clause because it compares two columns on related rows (Task.dueDate
 * vs AlertDismissal.dismissedDueDate), which Prisma's fluent API can't express without raw
 * SQL. This is safe from a "don't load everything" standpoint because the WHERE clause
 * already narrows the result to just this user's own overdue+assigned tasks — a small,
 * per-user set, not the task table at large.
 */
async function overdueAssignedTasksWithDismissals(userId: string) {
  return prisma.task.findMany({
    where: {
      assignees: { some: { userId } },
      dueDate: { lt: new Date() },
      status: { not: 'DONE' },
    },
    include: {
      project: { select: { id: true, key: true, name: true } },
      alertDismissals: { where: { userId } },
    },
    orderBy: { dueDate: 'asc' },
  });
}

function isSuppressed(task: {
  dueDate: Date | null;
  alertDismissals: { dismissedDueDate: Date | null }[];
}) {
  const dismissal = task.alertDismissals[0];
  if (!dismissal) return false;
  const dismissedAt = dismissal.dismissedDueDate?.getTime() ?? null;
  const currentAt = task.dueDate?.getTime() ?? null;
  return dismissedAt === currentAt;
}

export async function listAlerts(user: AuthenticatedUser) {
  const tasks = await overdueAssignedTasksWithDismissals(user.id);
  return tasks
    .filter((t) => !isSuppressed(t))
    .map(({ alertDismissals: _alertDismissals, ...task }) => task);
}

export async function getAlertCount(user: AuthenticatedUser): Promise<number> {
  const alerts = await listAlerts(user);
  return alerts.length;
}

export async function dismissAlert(user: AuthenticatedUser, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw Errors.notFound('Task not found.');
  }

  const assignment = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId: user.id } },
  });
  if (!assignment) {
    throw Errors.forbidden('Only a user assigned to this task can dismiss its alert.');
  }

  return prisma.alertDismissal.upsert({
    where: { taskId_userId: { taskId, userId: user.id } },
    create: { taskId, userId: user.id, dismissedDueDate: task.dueDate },
    update: { dismissedDueDate: task.dueDate },
  });
}

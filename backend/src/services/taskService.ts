import { AuthenticatedUser } from '../middleware/auth';
import { Errors } from '../utils/AppError';
import { prisma } from '../utils/prisma';
import { assertProjectAccessible } from './projectService';
import { recordHistory } from './historyService';
import { CreateTaskInput, UpdateTaskInput } from '../validators/taskValidators';

const taskInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  project: { select: { id: true, key: true, name: true, archived: true } },
} as const;

/** Loads a task and verifies the requesting user can see the project it belongs to.
 * Reused by dependency/assignment/lifecycle/history/comment services. */
export async function assertTaskAccessible(user: AuthenticatedUser, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    throw Errors.notFound('Task not found.');
  }
  await assertProjectAccessible(user, task.projectId);
  return task;
}

export async function createTask(
  user: AuthenticatedUser,
  projectId: string,
  input: CreateTaskInput,
) {
  await assertProjectAccessible(user, projectId);

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        projectId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        status: 'BACKLOG',
        createdById: user.id,
      },
    });
    await recordHistory(tx, {
      taskId: task.id,
      actorId: user.id,
      type: 'CREATED',
      metadata: { title: task.title },
    });
    return task;
  });
}

export async function getTaskById(user: AuthenticatedUser, taskId: string) {
  const task = await assertTaskAccessible(user, taskId);
  return prisma.task.findUnique({ where: { id: task.id }, include: taskInclude });
}

const EDITABLE_FIELDS = ['title', 'description', 'priority', 'dueDate'] as const;

function serializeForHistory(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function updateTask(user: AuthenticatedUser, taskId: string, input: UpdateTaskInput) {
  const task = await assertTaskAccessible(user, taskId);

  return prisma.$transaction(async (tx) => {
    const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];
    for (const field of EDITABLE_FIELDS) {
      if (field in input && input[field] !== undefined) {
        const newValue = input[field];
        const oldValue = (task as any)[field];
        const oldComparable = oldValue instanceof Date ? oldValue.toISOString() : oldValue;
        const newComparable = newValue instanceof Date ? newValue.toISOString() : newValue;
        if (oldComparable !== newComparable) {
          changes.push({ field, oldValue, newValue });
        }
      }
    }

    const updated = await tx.task.update({
      where: { id: taskId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      },
    });

    for (const change of changes) {
      await recordHistory(tx, {
        taskId,
        actorId: user.id,
        type: 'FIELD_CHANGE',
        field: change.field,
        oldValue: serializeForHistory(change.oldValue),
        newValue: serializeForHistory(change.newValue),
      });
    }

    return updated;
  });
}

export async function deleteTask(user: AuthenticatedUser, taskId: string) {
  await assertTaskAccessible(user, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}

import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { TaskQuery } from '../validators/taskQueryValidators';

export interface TaskFilters {
  search?: string;
  projectId?: string;
  status?: string;
  assigneeId?: string;
  priority?: string;
  overdue?: boolean;
}

/**
 * Builds the Prisma `where` clause shared by the paginated task list, CSV export, and
 * (for scope only) dashboard queries — so authorization scope and filter semantics can
 * never drift between "what you see in the list" and "what you get in your export."
 * Applies authorization scope FIRST: a member's where clause is always anchored to their
 * project memberships at the database level, never filtered client-side after a broader
 * fetch.
 */
export function buildTaskWhere(
  user: AuthenticatedUser,
  filters: TaskFilters,
): Prisma.TaskWhereInput {
  const scope: Prisma.TaskWhereInput =
    user.role === 'MANAGER' ? {} : { project: { members: { some: { userId: user.id } } } };

  const clauses: Prisma.TaskWhereInput[] = [scope];

  if (filters.search) {
    clauses.push({
      OR: [{ title: { contains: filters.search } }, { description: { contains: filters.search } }],
    });
  }
  if (filters.projectId) clauses.push({ projectId: filters.projectId });
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.priority) clauses.push({ priority: filters.priority });
  if (filters.assigneeId) clauses.push({ assignees: { some: { userId: filters.assigneeId } } });
  if (filters.overdue) {
    clauses.push({ dueDate: { lt: new Date() }, status: { not: 'DONE' } });
  }

  return { AND: clauses };
}

export function buildTaskOrderBy(
  sortBy: TaskQuery['sortBy'],
  sortOrder: TaskQuery['sortOrder'],
): Prisma.TaskOrderByWithRelationInput {
  if (sortBy === 'priority') return { priorityRank: sortOrder };
  if (sortBy === 'dueDate') return { dueDate: sortOrder };
  return { updatedAt: sortOrder };
}

export const taskListInclude = {
  assignees: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  project: { select: { id: true, key: true, name: true } },
} as const;

export async function listTasksPaged(user: AuthenticatedUser, query: TaskQuery) {
  const where = buildTaskWhere(user, query);
  const orderBy = buildTaskOrderBy(query.sortBy, query.sortOrder);

  const [data, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: taskListInclude,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    data,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

import { AuthenticatedUser } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { buildTaskWhere } from './taskQueryService';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function scopeWhere(user: AuthenticatedUser) {
  return buildTaskWhere(user, {});
}

export async function getSummary(user: AuthenticatedUser) {
  const where = scopeWhere(user);
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + WEEK_MS);
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  const [open, overdue, dueThisWeek, completedThisWeek] = await Promise.all([
    prisma.task.count({ where: { AND: [where, { status: { not: 'DONE' } }] } }),
    prisma.task.count({
      where: { AND: [where, { status: { not: 'DONE' }, dueDate: { lt: now } }] },
    }),
    prisma.task.count({
      where: {
        AND: [where, { status: { not: 'DONE' }, dueDate: { gte: now, lte: weekFromNow } }],
      },
    }),
    // "completed" is read from updatedAt on DONE tasks — see docs/decisions.md #8.
    prisma.task.count({
      where: { AND: [where, { status: 'DONE', updatedAt: { gte: weekAgo } }] },
    }),
  ]);

  return { openTasks: open, overdueTasks: overdue, dueThisWeek, completedThisWeek };
}

export async function getStatusBreakdown(user: AuthenticatedUser) {
  const where = scopeWhere(user);
  const groups = await prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } });
  return groups.map((g) => ({ status: g.status, count: g._count._all }));
}

export async function getAssigneeBreakdown(user: AuthenticatedUser) {
  const where = scopeWhere(user);
  const groups = await prisma.taskAssignee.groupBy({
    by: ['userId'],
    where: { task: where },
    _count: { _all: true },
  });

  if (groups.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: groups.map((g) => g.userId) } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return groups
    .map((g) => ({ user: userById.get(g.userId) ?? null, count: g._count._all }))
    .filter((g) => g.user !== null)
    .sort((a, b) => b.count - a.count);
}

/**
 * Completions bucketed into 8 rolling 7-day windows ending now (week 0 = most recent 7
 * days). Only DONE tasks completed within the last 8 weeks are fetched from the database
 * (a small, already-scoped set, not the whole task table) — the bucket-index arithmetic
 * then runs in application code because SQLite has no native date-truncation function to
 * express "group by calendar week" in a portable way through Prisma's query builder.
 */
export async function getCompletionsTrend(user: AuthenticatedUser) {
  const where = scopeWhere(user);
  const now = new Date();
  const eightWeeksAgo = new Date(now.getTime() - 8 * WEEK_MS);

  const tasks = await prisma.task.findMany({
    where: { AND: [where, { status: 'DONE', updatedAt: { gte: eightWeeksAgo } }] },
    select: { updatedAt: true },
  });

  const buckets = Array.from({ length: 8 }, (_, i) => {
    const weekIndex = 7 - i; // oldest first
    const weekEnd = new Date(now.getTime() - weekIndex * WEEK_MS);
    const weekStart = new Date(weekEnd.getTime() - WEEK_MS);
    return { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString(), count: 0 };
  });

  for (const task of tasks) {
    const ageMs = now.getTime() - task.updatedAt.getTime();
    const weeksAgo = Math.min(7, Math.floor(ageMs / WEEK_MS));
    const bucketIndex = 7 - weeksAgo;
    if (bucketIndex >= 0 && bucketIndex < 8) {
      buckets[bucketIndex].count += 1;
    }
  }

  return buckets;
}

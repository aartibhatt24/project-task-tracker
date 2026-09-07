export const ROLES = ['MANAGER', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Numeric sort weight for priority, since SQLite (and Prisma's fluent orderBy) would
 * otherwise sort the String priority column alphabetically (HIGH, LOW, MEDIUM, URGENT)
 * instead of by actual severity. Stored denormalized on Task.priorityRank, kept in sync on
 * every create/update, so sorting stays a plain indexed column order — no raw SQL needed. */
export const PRIORITY_RANK: Record<Priority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

export const STATUSES = ['BACKLOG', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as const;
export type Status = (typeof STATUSES)[number];

export const HISTORY_TYPES = [
  'CREATED',
  'FIELD_CHANGE',
  'STATUS_CHANGE',
  'ASSIGNED',
  'UNASSIGNED',
  'COMMENT',
] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

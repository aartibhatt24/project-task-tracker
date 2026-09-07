export const ROLES = ['MANAGER', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

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

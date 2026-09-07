import { z } from 'zod';
import { PRIORITIES, STATUSES } from '../domain/constants';

const SORT_FIELDS = ['dueDate', 'priority', 'updatedAt'] as const;

export const taskQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  projectId: z.string().min(1).optional(),
  status: z.enum(STATUSES).optional(),
  assigneeId: z.string().min(1).optional(),
  priority: z.enum(PRIORITIES).optional(),
  overdue: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  sortBy: z.enum(SORT_FIELDS).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;

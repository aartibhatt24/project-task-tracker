import { z } from 'zod';
import { STATUSES } from '../domain/constants';

// Bulk-editable fields are exactly the three PROJECT_SPEC.md 1.8 calls out: status,
// assignees, due date. (Title/description/priority stay single-task-only, matching
// decision #12 — those are structural edits, not day-to-day bulk actions.)
export const bulkUpdateSchema = z
  .object({
    taskIds: z.array(z.string().min(1)).min(1).max(200),
    changes: z.object({
      status: z.enum(STATUSES).optional(),
      assigneeIds: z.array(z.string().min(1)).optional(),
      dueDate: z.union([z.string().datetime(), z.string().date(), z.null()]).optional(),
    }),
  })
  .refine((v) => Object.keys(v.changes).length > 0, {
    message: 'At least one change (status, assigneeIds, or dueDate) is required.',
    path: ['changes'],
  });

export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>;

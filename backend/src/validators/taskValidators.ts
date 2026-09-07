import { z } from 'zod';
import { PRIORITIES } from '../domain/constants';

const priorityEnum = z.enum(PRIORITIES);

const dueDateField = z
  .union([z.string().datetime(), z.string().date(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : v === null ? null : undefined));

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: priorityEnum.default('MEDIUM'),
  dueDate: dueDateField,
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  priority: priorityEnum.optional(),
  dueDate: dueDateField,
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

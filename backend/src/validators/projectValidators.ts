import { z } from 'zod';

export const createProjectSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[A-Za-z][A-Za-z0-9]*$/, 'Key must start with a letter and be alphanumeric.')
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const addMemberSchema = z.object({
  userId: z.string().min(1),
});

export const listProjectsQuerySchema = z.object({
  includeArchived: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

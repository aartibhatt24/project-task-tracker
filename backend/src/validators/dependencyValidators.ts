import { z } from 'zod';

export const addDependencySchema = z.object({
  blockerTaskId: z.string().min(1),
});

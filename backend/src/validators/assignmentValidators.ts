import { z } from 'zod';

export const setAssigneesSchema = z.object({
  userIds: z.array(z.string().min(1)).max(50),
});

import { z } from 'zod';
import { STATUSES } from '../domain/constants';

export const updateStatusSchema = z.object({
  status: z.enum(STATUSES),
});

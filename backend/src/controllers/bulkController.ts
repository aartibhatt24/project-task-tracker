import { Request, Response } from 'express';
import { bulkUpdateTasks } from '../services/bulkService';
import { bulkUpdateSchema } from '../validators/bulkValidators';

export async function bulkUpdate(req: Request, res: Response) {
  const input = bulkUpdateSchema.parse(req.body);
  const result = await bulkUpdateTasks(req.user!, input);
  res.json(result);
}

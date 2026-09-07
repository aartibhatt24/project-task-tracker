import { Router } from 'express';
import * as alertController from '../controllers/alertController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

export const alertsRouter = Router();

alertsRouter.use(requireAuth);
alertsRouter.get('/alerts', asyncHandler(alertController.list));
alertsRouter.post('/alerts/:taskId/dismiss', asyncHandler(alertController.dismiss));

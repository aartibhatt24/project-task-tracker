import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get('/dashboard/summary', asyncHandler(dashboardController.summary));
dashboardRouter.get('/dashboard/status', asyncHandler(dashboardController.status));
dashboardRouter.get('/dashboard/assignees', asyncHandler(dashboardController.assignees));
dashboardRouter.get('/dashboard/completions', asyncHandler(dashboardController.completions));

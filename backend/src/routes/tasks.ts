import { Router } from 'express';
import * as taskController from '../controllers/taskController';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.post(
  '/projects/:projectId/tasks',
  requireRole('MANAGER'),
  asyncHandler(taskController.create),
);
tasksRouter.get('/tasks/:id', asyncHandler(taskController.getOne));
tasksRouter.patch('/tasks/:id', requireRole('MANAGER'), asyncHandler(taskController.update));
tasksRouter.delete('/tasks/:id', requireRole('MANAGER'), asyncHandler(taskController.remove));

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
tasksRouter.post('/tasks/:id/status', asyncHandler(taskController.updateStatus));
tasksRouter.post(
  '/tasks/:id/assignees',
  requireRole('MANAGER'),
  asyncHandler(taskController.setAssignees),
);
tasksRouter.post(
  '/tasks/:id/dependencies',
  requireRole('MANAGER'),
  asyncHandler(taskController.addDependency),
);
tasksRouter.get('/tasks/:id/dependencies', asyncHandler(taskController.listDependencies));

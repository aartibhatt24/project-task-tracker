import { Router } from 'express';
import * as projectController from '../controllers/projectController';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get('/projects', asyncHandler(projectController.list));
projectsRouter.post('/projects', requireRole('MANAGER'), asyncHandler(projectController.create));
projectsRouter.get('/projects/:id', asyncHandler(projectController.getOne));
projectsRouter.patch(
  '/projects/:id',
  requireRole('MANAGER'),
  asyncHandler(projectController.update),
);
projectsRouter.post(
  '/projects/:id/archive',
  requireRole('MANAGER'),
  asyncHandler(projectController.archive),
);
projectsRouter.post(
  '/projects/:id/restore',
  requireRole('MANAGER'),
  asyncHandler(projectController.restore),
);
projectsRouter.post(
  '/projects/:id/members',
  requireRole('MANAGER'),
  asyncHandler(projectController.addMember),
);
projectsRouter.delete(
  '/projects/:id/members/:userId',
  requireRole('MANAGER'),
  asyncHandler(projectController.removeMember),
);

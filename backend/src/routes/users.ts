import { Router } from 'express';
import * as userController from '../controllers/userController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get('/users', asyncHandler(userController.list));
usersRouter.get('/users/:id', asyncHandler(userController.getOne));

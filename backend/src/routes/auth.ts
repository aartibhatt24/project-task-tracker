import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

export const authRouter = Router();

authRouter.post('/auth/login', asyncHandler(authController.login));
authRouter.post('/auth/logout', asyncHandler(authController.logout));
authRouter.get('/auth/me', requireAuth, asyncHandler(authController.me));

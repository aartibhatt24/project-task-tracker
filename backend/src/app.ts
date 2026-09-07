import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { projectsRouter } from './routes/projects';
import { usersRouter } from './routes/users';
import { env } from './utils/env';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', usersRouter);
  app.use('/api', projectsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

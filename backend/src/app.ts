import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { alertsRouter } from './routes/alerts';
import { authRouter } from './routes/auth';
import { dashboardRouter } from './routes/dashboard';
import { healthRouter } from './routes/health';
import { projectsRouter } from './routes/projects';
import { tasksRouter } from './routes/tasks';
import { usersRouter } from './routes/users';
import { env } from './utils/env';

export function createApp() {
  const app = express();

  // API-only server: no HTML is ever served, so it's safe to disable CSP here (it would
  // otherwise default to a policy meant for HTML responses) while keeping helmet's other
  // headers (X-Content-Type-Options, X-Frame-Options, etc.).
  app.use(helmet({ contentSecurityPolicy: false }));
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
  app.use('/api', tasksRouter);
  app.use('/api', alertsRouter);
  app.use('/api', dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

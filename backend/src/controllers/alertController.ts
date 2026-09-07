import { Request, Response } from 'express';
import * as alertService from '../services/alertService';

export async function list(req: Request, res: Response) {
  const alerts = await alertService.listAlerts(req.user!);
  res.json({ data: alerts, count: alerts.length });
}

export async function dismiss(req: Request, res: Response) {
  const dismissal = await alertService.dismissAlert(req.user!, req.params.taskId);
  res.json({ data: dismissal });
}

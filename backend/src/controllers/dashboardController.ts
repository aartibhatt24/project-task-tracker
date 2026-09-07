import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboardService';

export async function summary(req: Request, res: Response) {
  res.json({ data: await dashboardService.getSummary(req.user!) });
}

export async function status(req: Request, res: Response) {
  res.json({ data: await dashboardService.getStatusBreakdown(req.user!) });
}

export async function assignees(req: Request, res: Response) {
  res.json({ data: await dashboardService.getAssigneeBreakdown(req.user!) });
}

export async function completions(req: Request, res: Response) {
  res.json({ data: await dashboardService.getCompletionsTrend(req.user!) });
}

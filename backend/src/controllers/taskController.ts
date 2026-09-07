import { Request, Response } from 'express';
import * as lifecycleService from '../services/lifecycleService';
import * as taskService from '../services/taskService';
import { createTaskSchema, updateTaskSchema } from '../validators/taskValidators';
import { updateStatusSchema } from '../validators/statusValidators';

export async function create(req: Request, res: Response) {
  const input = createTaskSchema.parse(req.body);
  const task = await taskService.createTask(req.user!, req.params.projectId, input);
  res.status(201).json({ data: task });
}

export async function getOne(req: Request, res: Response) {
  const task = await taskService.getTaskById(req.user!, req.params.id);
  res.json({ data: task });
}

export async function update(req: Request, res: Response) {
  const input = updateTaskSchema.parse(req.body);
  const task = await taskService.updateTask(req.user!, req.params.id, input);
  res.json({ data: task });
}

export async function remove(req: Request, res: Response) {
  await taskService.deleteTask(req.user!, req.params.id);
  res.status(204).send();
}

export async function updateStatus(req: Request, res: Response) {
  const input = updateStatusSchema.parse(req.body);
  const task = await lifecycleService.updateTaskStatus(req.user!, req.params.id, input.status);
  res.json({ data: task });
}

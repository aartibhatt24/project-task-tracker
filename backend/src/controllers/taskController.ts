import { Request, Response } from 'express';
import * as assignmentService from '../services/assignmentService';
import * as dependencyService from '../services/dependencyService';
import * as lifecycleService from '../services/lifecycleService';
import * as taskService from '../services/taskService';
import * as historyService from '../services/historyService';
import { generateTaskCsv } from '../services/csvExportService';
import { listTasksPaged } from '../services/taskQueryService';
import { setAssigneesSchema } from '../validators/assignmentValidators';
import { addCommentSchema } from '../validators/commentValidators';
import { addDependencySchema } from '../validators/dependencyValidators';
import { taskQuerySchema } from '../validators/taskQueryValidators';
import { createTaskSchema, updateTaskSchema } from '../validators/taskValidators';
import { updateStatusSchema } from '../validators/statusValidators';

export async function list(req: Request, res: Response) {
  const query = taskQuerySchema.parse(req.query);
  const result = await listTasksPaged(req.user!, query);
  res.json(result);
}

export async function exportCsv(req: Request, res: Response) {
  const query = taskQuerySchema.parse(req.query);
  const csv = await generateTaskCsv(req.user!, query, query.sortBy, query.sortOrder);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"');
  res.send(csv);
}

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

export async function setAssignees(req: Request, res: Response) {
  const input = setAssigneesSchema.parse(req.body);
  const assignees = await assignmentService.setTaskAssignees(
    req.user!,
    req.params.id,
    input.userIds,
  );
  res.json({ data: assignees });
}

export async function addDependency(req: Request, res: Response) {
  const input = addDependencySchema.parse(req.body);
  const dependency = await dependencyService.addDependency(
    req.user!,
    req.params.id,
    input.blockerTaskId,
  );
  res.status(201).json({ data: dependency });
}

export async function listDependencies(req: Request, res: Response) {
  const dependencies = await dependencyService.listDependencies(req.user!, req.params.id);
  res.json({ data: dependencies });
}

export async function getHistory(req: Request, res: Response) {
  const history = await historyService.listTaskHistory(req.user!, req.params.id);
  res.json({ data: history });
}

export async function addComment(req: Request, res: Response) {
  const input = addCommentSchema.parse(req.body);
  const comment = await historyService.addComment(req.user!, req.params.id, input.text);
  res.status(201).json({ data: comment });
}

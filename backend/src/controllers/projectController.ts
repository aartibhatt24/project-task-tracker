import { Request, Response } from 'express';
import * as projectService from '../services/projectService';
import {
  addMemberSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from '../validators/projectValidators';

export async function list(req: Request, res: Response) {
  const query = listProjectsQuerySchema.parse(req.query);
  const projects = await projectService.listProjects(req.user!, query.includeArchived ?? false);
  res.json({ data: projects });
}

export async function create(req: Request, res: Response) {
  const input = createProjectSchema.parse(req.body);
  const project = await projectService.createProject(req.user!, input);
  res.status(201).json({ data: project });
}

export async function getOne(req: Request, res: Response) {
  const project = await projectService.getProjectById(req.user!, req.params.id);
  res.json({ data: project });
}

export async function update(req: Request, res: Response) {
  const input = updateProjectSchema.parse(req.body);
  const project = await projectService.updateProject(req.user!, req.params.id, input);
  res.json({ data: project });
}

export async function archive(req: Request, res: Response) {
  const project = await projectService.archiveProject(req.user!, req.params.id);
  res.json({ data: project });
}

export async function restore(req: Request, res: Response) {
  const project = await projectService.restoreProject(req.user!, req.params.id);
  res.json({ data: project });
}

export async function addMember(req: Request, res: Response) {
  const input = addMemberSchema.parse(req.body);
  const membership = await projectService.addMember(req.user!, req.params.id, input.userId);
  res.status(201).json({ data: membership });
}

export async function removeMember(req: Request, res: Response) {
  await projectService.removeMember(req.user!, req.params.id, req.params.userId);
  res.status(204).send();
}

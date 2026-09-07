import { Request, Response } from 'express';
import * as userService from '../services/userService';

export async function list(_req: Request, res: Response) {
  const users = await userService.listUsers();
  res.json({ data: users });
}

export async function getOne(req: Request, res: Response) {
  const user = await userService.getUserById(req.params.id);
  res.json({ data: user });
}

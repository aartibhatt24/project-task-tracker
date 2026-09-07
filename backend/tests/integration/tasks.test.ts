import { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { loginAndGetCookie } from '../helpers/auth';
import {
  TEST_PASSWORD,
  addMember,
  createProject,
  createTask,
  createUser,
} from '../helpers/factories';
import { resetDb, testPrisma } from '../helpers/testDb';

describe('task CRUD', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await testPrisma.$disconnect();
  });

  async function setup() {
    const manager = await createUser({ role: 'MANAGER' });
    const managerCookie = await loginAndGetCookie(app, manager.email, TEST_PASSWORD);
    const member = await createUser({ role: 'MEMBER' });
    const memberCookie = await loginAndGetCookie(app, member.email, TEST_PASSWORD);
    const outsider = await createUser({ role: 'MEMBER' });
    const outsiderCookie = await loginAndGetCookie(app, outsider.email, TEST_PASSWORD);
    const project = await createProject(manager.id);
    await addMember(project.id, member.id);
    return { manager, managerCookie, member, memberCookie, outsider, outsiderCookie, project };
  }

  it('lets a manager create a task, with an initial CREATED history entry', async () => {
    const { managerCookie, project } = await setup();

    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set('Cookie', managerCookie)
      .send({ title: 'Ship the feature', priority: 'HIGH', dueDate: '2030-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('BACKLOG');
    expect(res.body.data.title).toBe('Ship the feature');

    const history = await testPrisma.taskHistory.findMany({ where: { taskId: res.body.data.id } });
    expect(history).toHaveLength(1);
    expect(history[0].type).toBe('CREATED');
  });

  it('rejects task creation with an invalid payload', async () => {
    const { managerCookie, project } = await setup();
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set('Cookie', managerCookie)
      .send({ title: '', priority: 'NOT_A_PRIORITY' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects task creation by a member (creation is manager-only)', async () => {
    const { memberCookie, project } = await setup();
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set('Cookie', memberCookie)
      .send({ title: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects task creation in a project the manager cannot see (n/a) and unauthorized project access', async () => {
    const { outsiderCookie, project } = await setup();
    // outsider is not even a member, and not a manager attempting creation makes this 403 first
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set('Cookie', outsiderCookie)
      .send({ title: 'x' });
    expect(res.status).toBe(403);
  });

  it('a project member can retrieve a task in their project', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app).get(`/api/tasks/${task.id}`).set('Cookie', memberCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(task.id);
  });

  it('a non-member cannot retrieve a task in a project they do not belong to (IDOR)', async () => {
    const { manager, outsiderCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app).get(`/api/tasks/${task.id}`).set('Cookie', outsiderCookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent task', async () => {
    const { managerCookie } = await setup();
    const res = await request(app).get('/api/tasks/does-not-exist').set('Cookie', managerCookie);
    expect(res.status).toBe(404);
  });

  it('lets a manager edit a task and records FIELD_CHANGE history per changed field', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { title: 'Old', priority: 'LOW' });

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', managerCookie)
      .send({ title: 'New', priority: 'URGENT' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
    expect(res.body.data.priority).toBe('URGENT');

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: task.id, type: 'FIELD_CHANGE' },
      orderBy: { field: 'asc' },
    });
    expect(history).toHaveLength(2);
    const fields = history.map((h) => h.field).sort();
    expect(fields).toEqual(['priority', 'title']);
    const titleChange = history.find((h) => h.field === 'title')!;
    expect(titleChange.oldValue).toBe('Old');
    expect(titleChange.newValue).toBe('New');
  });

  it('does not record history for a no-op update (same values)', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { title: 'Same' });

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', managerCookie)
      .send({ title: 'Same' });

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: task.id, type: 'FIELD_CHANGE' },
    });
    expect(history).toHaveLength(0);
  });

  it('rejects a member editing a task (edit is manager-only)', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', memberCookie)
      .send({ title: 'hacked' });
    expect(res.status).toBe(403);
  });

  it('lets a manager delete a task', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app).delete(`/api/tasks/${task.id}`).set('Cookie', managerCookie);
    expect(res.status).toBe(204);

    const found = await testPrisma.task.findUnique({ where: { id: task.id } });
    expect(found).toBeNull();
  });

  it('rejects a member deleting a task', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app).delete(`/api/tasks/${task.id}`).set('Cookie', memberCookie);
    expect(res.status).toBe(403);

    const found = await testPrisma.task.findUnique({ where: { id: task.id } });
    expect(found).not.toBeNull();
  });

  it('rejects all task routes without authentication', async () => {
    const { project } = await setup();
    const res = await request(app).get(`/api/projects/${project.id}`);
    expect(res.status).toBe(401);
  });
});

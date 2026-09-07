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

describe('task dependencies', () => {
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
    const project = await createProject(manager.id);
    await addMember(project.id, member.id);
    return { manager, managerCookie, member, memberCookie, project };
  }

  it('creates a valid same-project dependency', async () => {
    const { manager, managerCookie, project } = await setup();
    const blocker = await createTask(project.id, manager.id, { title: 'Blocker' });
    const blocked = await createTask(project.id, manager.id, { title: 'Blocked' });

    const res = await request(app)
      .post(`/api/tasks/${blocked.id}/dependencies`)
      .set('Cookie', managerCookie)
      .send({ blockerTaskId: blocker.id });

    expect(res.status).toBe(201);

    const stored = await testPrisma.taskDependency.findUnique({
      where: {
        blockerTaskId_blockedTaskId: { blockerTaskId: blocker.id, blockedTaskId: blocked.id },
      },
    });
    expect(stored).not.toBeNull();
  });

  it('rejects a task blocking itself', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/dependencies`)
      .set('Cookie', managerCookie)
      .send({ blockerTaskId: task.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DEPENDENCY');
  });

  it('rejects a cross-project dependency', async () => {
    const { manager, managerCookie, project } = await setup();
    const otherProject = await createProject(manager.id);
    const blocker = await createTask(otherProject.id, manager.id);
    const blocked = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${blocked.id}/dependencies`)
      .set('Cookie', managerCookie)
      .send({ blockerTaskId: blocker.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CROSS_PROJECT_DEPENDENCY');
  });

  it('rejects a duplicate dependency', async () => {
    const { manager, managerCookie, project } = await setup();
    const blocker = await createTask(project.id, manager.id);
    const blocked = await createTask(project.id, manager.id);
    await testPrisma.taskDependency.create({
      data: { blockerTaskId: blocker.id, blockedTaskId: blocked.id },
    });

    const res = await request(app)
      .post(`/api/tasks/${blocked.id}/dependencies`)
      .set('Cookie', managerCookie)
      .send({ blockerTaskId: blocker.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEPENDENCY_EXISTS');
  });

  it('rejects a non-existent blocker task', async () => {
    const { manager, managerCookie, project } = await setup();
    const blocked = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${blocked.id}/dependencies`)
      .set('Cookie', managerCookie)
      .send({ blockerTaskId: 'does-not-exist' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BLOCKER_NOT_FOUND');
  });

  it('rejects a member from creating a dependency (structural change is manager-only)', async () => {
    const { manager, memberCookie, project } = await setup();
    const blocker = await createTask(project.id, manager.id);
    const blocked = await createTask(project.id, manager.id);

    const res = await request(app)
      .post(`/api/tasks/${blocked.id}/dependencies`)
      .set('Cookie', memberCookie)
      .send({ blockerTaskId: blocker.id });

    expect(res.status).toBe(403);
  });

  it('lists blockedBy and blocks relationships for a task', async () => {
    const { manager, managerCookie, project } = await setup();
    const a = await createTask(project.id, manager.id, { title: 'A' });
    const b = await createTask(project.id, manager.id, { title: 'B' });
    const c = await createTask(project.id, manager.id, { title: 'C' });
    await testPrisma.taskDependency.create({ data: { blockerTaskId: a.id, blockedTaskId: b.id } });
    await testPrisma.taskDependency.create({ data: { blockerTaskId: b.id, blockedTaskId: c.id } });

    const res = await request(app)
      .get(`/api/tasks/${b.id}/dependencies`)
      .set('Cookie', managerCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.blockedBy.map((t: any) => t.id)).toEqual([a.id]);
    expect(res.body.data.blocks.map((t: any) => t.id)).toEqual([c.id]);
  });
});

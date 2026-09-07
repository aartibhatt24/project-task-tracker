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

describe('task lifecycle over HTTP', () => {
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

  async function setStatus(cookie: string, taskId: string, status: string) {
    return request(app).post(`/api/tasks/${taskId}/status`).set('Cookie', cookie).send({ status });
  }

  it('a member can move a task through the normal lifecycle path', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    let res = await setStatus(memberCookie, task.id, 'IN_PROGRESS');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');

    res = await setStatus(memberCookie, task.id, 'IN_REVIEW');
    expect(res.status).toBe(200);

    res = await setStatus(memberCookie, task.id, 'DONE');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DONE');

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: task.id, type: 'STATUS_CHANGE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(history).toHaveLength(3);
    expect(history[0]).toMatchObject({ oldValue: 'BACKLOG', newValue: 'IN_PROGRESS' });
    expect(history[2]).toMatchObject({ oldValue: 'IN_REVIEW', newValue: 'DONE' });
  });

  it('rejects illegal transitions with 409 INVALID_STATUS_TRANSITION', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    const res = await setStatus(memberCookie, task.id, 'DONE');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const unchanged = await testPrisma.task.findUnique({ where: { id: task.id } });
    expect(unchanged?.status).toBe('BACKLOG');
  });

  it('blocks IN_REVIEW -> DONE while an unfinished blocker exists', async () => {
    const { manager, memberCookie, project } = await setup();
    const blocker = await createTask(project.id, manager.id, { status: 'IN_PROGRESS' });
    const target = await createTask(project.id, manager.id, { status: 'IN_REVIEW' });
    await testPrisma.taskDependency.create({
      data: { blockerTaskId: blocker.id, blockedTaskId: target.id },
    });

    const res = await setStatus(memberCookie, target.id, 'DONE');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const unchanged = await testPrisma.task.findUnique({ where: { id: target.id } });
    expect(unchanged?.status).toBe('IN_REVIEW');
  });

  it('allows IN_REVIEW -> DONE once the blocker is DONE', async () => {
    const { manager, memberCookie, project } = await setup();
    const blocker = await createTask(project.id, manager.id, { status: 'DONE' });
    const target = await createTask(project.id, manager.id, { status: 'IN_REVIEW' });
    await testPrisma.taskDependency.create({
      data: { blockerTaskId: blocker.id, blockedTaskId: target.id },
    });

    const res = await setStatus(memberCookie, target.id, 'DONE');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DONE');
  });

  it('blocking from IN_PROGRESS records blockedFromStatus and unblocking restores it exactly', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'IN_PROGRESS' });

    let res = await setStatus(memberCookie, task.id, 'BLOCKED');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.blockedFromStatus).toBe('IN_PROGRESS');

    res = await setStatus(memberCookie, task.id, 'IN_PROGRESS');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.blockedFromStatus).toBeNull();
  });

  it('blocking from IN_REVIEW records blockedFromStatus and unblocking restores it exactly', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'IN_REVIEW' });

    let res = await setStatus(memberCookie, task.id, 'BLOCKED');
    expect(res.body.data.blockedFromStatus).toBe('IN_REVIEW');

    res = await setStatus(memberCookie, task.id, 'IN_REVIEW');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_REVIEW');
  });

  it('rejects unblocking to a status other than the exact recorded prior status', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, {
      status: 'BLOCKED',
      blockedFromStatus: 'IN_PROGRESS',
    });

    const res = await setStatus(memberCookie, task.id, 'DONE');
    expect(res.status).toBe(409);
  });

  it('reopens a DONE task back to IN_REVIEW', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'DONE' });

    const res = await setStatus(memberCookie, task.id, 'IN_REVIEW');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_REVIEW');
  });

  it('rejects a status update from a non-member of the project', async () => {
    const { manager, project } = await setup();
    const outsider = await createUser({ role: 'MEMBER' });
    const outsiderCookie = await loginAndGetCookie(app, outsider.email, TEST_PASSWORD);
    const task = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    const res = await setStatus(outsiderCookie, task.id, 'IN_PROGRESS');
    expect(res.status).toBe(403);
  });

  it('rejects an unknown status value', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);
    const res = await setStatus(memberCookie, task.id, 'NOT_A_STATUS');
    expect(res.status).toBe(400);
  });

  it('a manager can also perform status transitions', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'BACKLOG' });
    const res = await setStatus(managerCookie, task.id, 'IN_PROGRESS');
    expect(res.status).toBe(200);
  });
});

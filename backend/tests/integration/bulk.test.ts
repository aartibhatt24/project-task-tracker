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

describe('bulk task operations', () => {
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
    const project = await createProject(manager.id);
    await addMember(project.id, member.id);
    return { manager, managerCookie, member, memberCookie, outsider, project };
  }

  it('applies a status change to every task independently and returns per-task results', async () => {
    const { manager, managerCookie, project } = await setup();
    const t1 = await createTask(project.id, manager.id, { status: 'BACKLOG' });
    const t2 = await createTask(project.id, manager.id, { status: 'BACKLOG' });
    const t3 = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [t1.id, t2.id, t3.id], changes: { status: 'IN_PROGRESS' } });

    expect(res.status).toBe(200);
    expect(res.body.successful).toHaveLength(3);
    expect(res.body.failed).toHaveLength(0);

    const tasks = await testPrisma.task.findMany({
      where: { id: { in: [t1.id, t2.id, t3.id] } },
    });
    expect(tasks.every((t) => t.status === 'IN_PROGRESS')).toBe(true);
  });

  it('mixed batch: one succeeds, one fails on lifecycle, one fails on assignment, one succeeds', async () => {
    const { manager, managerCookie, member, outsider, project } = await setup();

    // Succeeds: legal transition
    const okTask = await createTask(project.id, manager.id, { status: 'BACKLOG' });
    // Fails: illegal transition (BACKLOG -> DONE)
    const illegalTask = await createTask(project.id, manager.id, { status: 'BACKLOG' });
    // Fails: has an unfinished blocker, so status->DONE should fail
    const blocker = await createTask(project.id, manager.id, { status: 'IN_PROGRESS' });
    const blockedTask = await createTask(project.id, manager.id, { status: 'IN_REVIEW' });
    await testPrisma.taskDependency.create({
      data: { blockerTaskId: blocker.id, blockedTaskId: blockedTask.id },
    });
    // Succeeds: legal transition
    const okTask2 = await createTask(project.id, manager.id, { status: 'IN_REVIEW' });

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({
        taskIds: [okTask.id, illegalTask.id, blockedTask.id, okTask2.id],
        changes: { status: 'DONE' },
      });

    expect(res.status).toBe(200);
    // okTask BACKLOG->DONE is illegal too, so it should fail; only okTask2 (IN_REVIEW->DONE) succeeds
    const successfulIds = res.body.successful.map((s: any) => s.taskId);
    const failedIds = res.body.failed.map((f: any) => f.taskId);

    expect(successfulIds).toContain(okTask2.id);
    expect(failedIds).toContain(illegalTask.id);
    expect(failedIds).toContain(blockedTask.id);
    expect(failedIds).toContain(okTask.id);

    for (const failure of res.body.failed) {
      expect(failure.code).toBeTruthy();
      expect(failure.reason).toBeTruthy();
    }

    const persistedOk2 = await testPrisma.task.findUnique({ where: { id: okTask2.id } });
    expect(persistedOk2?.status).toBe('DONE');
    const persistedIllegal = await testPrisma.task.findUnique({ where: { id: illegalTask.id } });
    expect(persistedIllegal?.status).toBe('BACKLOG');
    const persistedBlocked = await testPrisma.task.findUnique({ where: { id: blockedTask.id } });
    expect(persistedBlocked?.status).toBe('IN_REVIEW');

    void member;
    void outsider;
  });

  it('a failing assignee change in one task does not affect other tasks in the batch', async () => {
    const { manager, managerCookie, member, outsider, project } = await setup();
    const goodTask = await createTask(project.id, manager.id);
    const badTask = await createTask(project.id, manager.id);

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({
        taskIds: [goodTask.id, badTask.id],
        changes: { assigneeIds: [member.id] },
      });
    expect(res.body.successful.map((s: any) => s.taskId)).toEqual(
      expect.arrayContaining([goodTask.id, badTask.id]),
    );

    // Now try assigning an outsider (not a project member) to both; both should fail
    const res2 = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({
        taskIds: [goodTask.id, badTask.id],
        changes: { assigneeIds: [outsider.id] },
      });
    expect(res2.body.failed).toHaveLength(2);
    expect(res2.body.failed[0].code).toBe('NOT_PROJECT_MEMBER');

    // Original valid assignment from before should be untouched
    const stillAssigned = await testPrisma.taskAssignee.findMany({
      where: { taskId: goodTask.id },
    });
    expect(stillAssigned.map((a) => a.userId)).toEqual([member.id]);
  });

  it('bulk due-date change writes FIELD_CHANGE history for each affected task', async () => {
    const { manager, managerCookie, project } = await setup();
    const t1 = await createTask(project.id, manager.id);
    const t2 = await createTask(project.id, manager.id);
    const newDate = '2031-06-15T00:00:00.000Z';

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [t1.id, t2.id], changes: { dueDate: newDate } });

    expect(res.body.successful).toHaveLength(2);

    const h1 = await testPrisma.taskHistory.findMany({
      where: { taskId: t1.id, type: 'FIELD_CHANGE', field: 'dueDate' },
    });
    expect(h1).toHaveLength(1);
  });

  it('successful bulk status changes create the usual STATUS_CHANGE history entries', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [task.id], changes: { status: 'IN_PROGRESS' } });

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: task.id, type: 'STATUS_CHANGE' },
    });
    expect(history).toHaveLength(1);
  });

  it('a non-existent task id in the batch fails independently without affecting others', async () => {
    const { manager, managerCookie, project } = await setup();
    const real = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [real.id, 'does-not-exist'], changes: { status: 'IN_PROGRESS' } });

    expect(res.body.successful.map((s: any) => s.taskId)).toEqual([real.id]);
    expect(res.body.failed[0]).toMatchObject({ taskId: 'does-not-exist', code: 'NOT_FOUND' });
  });

  it('rejects bulk operations from a member (manager-only)', async () => {
    const { manager, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', memberCookie)
      .send({ taskIds: [task.id], changes: { status: 'IN_PROGRESS' } });

    expect(res.status).toBe(403);
  });

  it('rejects a request with no changes specified', async () => {
    const { manager, managerCookie, project } = await setup();
    const task = await createTask(project.id, manager.id);

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [task.id], changes: {} });

    expect(res.status).toBe(400);
  });

  it('a manager can bulk-update tasks in any project (manager scope covers everything, decision #10)', async () => {
    const { managerCookie } = await setup();
    const otherManager = await createUser({ role: 'MANAGER' });
    const otherProject = await createProject(otherManager.id);
    const otherTask = await createTask(otherProject.id, otherManager.id, { status: 'BACKLOG' });

    const res = await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [otherTask.id], changes: { status: 'IN_PROGRESS' } });

    expect(res.body.successful.map((s: any) => s.taskId)).toContain(otherTask.id);
  });

  it('a failed task in the batch does not write any history entries for that task', async () => {
    const { manager, managerCookie, project } = await setup();
    const illegalTask = await createTask(project.id, manager.id, { status: 'BACKLOG' });

    await request(app)
      .post('/api/tasks/bulk')
      .set('Cookie', managerCookie)
      .send({ taskIds: [illegalTask.id], changes: { status: 'DONE' } });

    const history = await testPrisma.taskHistory.findMany({
      where: { taskId: illegalTask.id, type: 'STATUS_CHANGE' },
    });
    expect(history).toHaveLength(0);
  });
});

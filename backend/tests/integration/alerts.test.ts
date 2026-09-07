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

describe('overdue alerts', () => {
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
    await addMember(project.id, outsider.id);
    return { manager, managerCookie, member, memberCookie, outsider, outsiderCookie, project };
  }

  const yesterday = () => new Date(Date.now() - 86400000);
  const nextWeek = () => new Date(Date.now() + 7 * 86400000);

  it('full lifecycle: overdue task appears, dismiss suppresses it, due-date change reopens it', async () => {
    const { manager, member, memberCookie, project } = await setup();

    // 1. create an overdue task assigned to member
    const task = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: member.id } });

    // 2. alert appears for the assigned member
    let res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: any) => t.id)).toContain(task.id);
    expect(res.body.count).toBeGreaterThanOrEqual(1);

    // 3. dismiss it
    const dismissRes = await request(app)
      .post(`/api/alerts/${task.id}/dismiss`)
      .set('Cookie', memberCookie);
    expect(dismissRes.status).toBe(200);

    // 4. confirm it is suppressed
    res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(res.body.data.map((t: any) => t.id)).not.toContain(task.id);

    // 5. change the due date (still overdue, but a different date)
    await testPrisma.task.update({
      where: { id: task.id },
      data: { dueDate: new Date(Date.now() - 2 * 86400000) },
    });

    // 6. confirm the alert becomes visible again
    res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(res.body.data.map((t: any) => t.id)).toContain(task.id);
  });

  it('an unassigned user cannot dismiss the alert', async () => {
    const { manager, member, outsiderCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: member.id } });

    const res = await request(app)
      .post(`/api/alerts/${task.id}/dismiss`)
      .set('Cookie', outsiderCookie);
    expect(res.status).toBe(403);
  });

  it('a DONE task is never overdue, even with a past due date', async () => {
    const { manager, member, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, {
      status: 'DONE',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: member.id } });

    const res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(res.body.data.map((t: any) => t.id)).not.toContain(task.id);
  });

  it('a task due in the future is not an alert', async () => {
    const { manager, member, memberCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: nextWeek(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: member.id } });

    const res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(res.body.data.map((t: any) => t.id)).not.toContain(task.id);
  });

  it('a user only sees alerts for tasks assigned to them, not every overdue task', async () => {
    const { manager, member, memberCookie, outsider, project } = await setup();
    const myTask = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: myTask.id, userId: member.id } });

    const otherTask = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: otherTask.id, userId: outsider.id } });

    const res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    const ids = res.body.data.map((t: any) => t.id);
    expect(ids).toContain(myTask.id);
    expect(ids).not.toContain(otherTask.id);
  });

  it('the count badge matches the number of active alerts', async () => {
    const { manager, member, memberCookie, project } = await setup();
    const t1 = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: yesterday(),
    });
    const t2 = await createTask(project.id, manager.id, {
      status: 'BACKLOG',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: t1.id, userId: member.id } });
    await testPrisma.taskAssignee.create({ data: { taskId: t2.id, userId: member.id } });

    const res = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  it('dismissing does not affect other users assigned to the same task', async () => {
    const { manager, member, memberCookie, outsider, outsiderCookie, project } = await setup();
    const task = await createTask(project.id, manager.id, {
      status: 'IN_PROGRESS',
      dueDate: yesterday(),
    });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: member.id } });
    await testPrisma.taskAssignee.create({ data: { taskId: task.id, userId: outsider.id } });

    await request(app).post(`/api/alerts/${task.id}/dismiss`).set('Cookie', memberCookie);

    const memberAlerts = await request(app).get('/api/alerts').set('Cookie', memberCookie);
    expect(memberAlerts.body.data.map((t: any) => t.id)).not.toContain(task.id);

    const outsiderAlerts = await request(app).get('/api/alerts').set('Cookie', outsiderCookie);
    expect(outsiderAlerts.body.data.map((t: any) => t.id)).toContain(task.id);
  });

  it('rejects dismissing a non-existent task', async () => {
    const { memberCookie } = await setup();
    const res = await request(app)
      .post('/api/alerts/does-not-exist/dismiss')
      .set('Cookie', memberCookie);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });
});

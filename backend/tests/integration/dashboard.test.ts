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

describe('dashboard analytics', () => {
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
    const visibleProject = await createProject(manager.id);
    const hiddenProject = await createProject(manager.id);
    await addMember(visibleProject.id, member.id);
    return { manager, managerCookie, member, memberCookie, visibleProject, hiddenProject };
  }

  const yesterday = () => new Date(Date.now() - 86400000);
  const in3Days = () => new Date(Date.now() + 3 * 86400000);
  const in30Days = () => new Date(Date.now() + 30 * 86400000);

  it('summary metrics match direct database counts for a manager (sees everything)', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { status: 'BACKLOG' }); // open
    await createTask(p.id, manager.id, { status: 'IN_PROGRESS', dueDate: yesterday() }); // open + overdue
    await createTask(p.id, manager.id, { status: 'IN_PROGRESS', dueDate: in3Days() }); // open + due this week
    await createTask(p.id, manager.id, { status: 'DONE' }); // completed this week (updatedAt=now)
    await createTask(p.id, manager.id, { status: 'DONE', dueDate: in30Days() }); // completed, not overdue

    const res = await request(app).get('/api/dashboard/summary').set('Cookie', managerCookie);
    expect(res.status).toBe(200);

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const [expectedOpen, expectedOverdue, expectedDueThisWeek, expectedCompleted] =
      await Promise.all([
        testPrisma.task.count({ where: { status: { not: 'DONE' } } }),
        testPrisma.task.count({ where: { status: { not: 'DONE' }, dueDate: { lt: now } } }),
        testPrisma.task.count({
          where: { status: { not: 'DONE' }, dueDate: { gte: now, lte: weekFromNow } },
        }),
        testPrisma.task.count({ where: { status: 'DONE', updatedAt: { gte: weekAgo } } }),
      ]);

    expect(res.body.data.openTasks).toBe(expectedOpen);
    expect(res.body.data.overdueTasks).toBe(expectedOverdue);
    expect(res.body.data.dueThisWeek).toBe(expectedDueThisWeek);
    expect(res.body.data.completedThisWeek).toBe(expectedCompleted);
  });

  it('summary is scoped to a member’s visible projects only', async () => {
    const { memberCookie, visibleProject, hiddenProject, manager } = await setup();
    await createTask(visibleProject.id, manager.id, { status: 'BACKLOG' });
    await createTask(hiddenProject.id, manager.id, { status: 'BACKLOG' });
    await createTask(hiddenProject.id, manager.id, { status: 'BACKLOG' });

    const res = await request(app).get('/api/dashboard/summary').set('Cookie', memberCookie);
    expect(res.body.data.openTasks).toBe(1);
  });

  it('status breakdown counts match a direct groupBy', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { status: 'BACKLOG' });
    await createTask(p.id, manager.id, { status: 'BACKLOG' });
    await createTask(p.id, manager.id, { status: 'DONE' });

    const res = await request(app).get('/api/dashboard/status').set('Cookie', managerCookie);
    const backlog = res.body.data.find((s: any) => s.status === 'BACKLOG');
    const done = res.body.data.find((s: any) => s.status === 'DONE');
    expect(backlog.count).toBe(2);
    expect(done.count).toBe(1);
  });

  it('assignee breakdown counts tasks per assignee within scope', async () => {
    const { managerCookie, visibleProject: p, manager, member } = await setup();
    const t1 = await createTask(p.id, manager.id);
    const t2 = await createTask(p.id, manager.id);
    await testPrisma.taskAssignee.create({ data: { taskId: t1.id, userId: member.id } });
    await testPrisma.taskAssignee.create({ data: { taskId: t2.id, userId: member.id } });

    const res = await request(app).get('/api/dashboard/assignees').set('Cookie', managerCookie);
    const entry = res.body.data.find((a: any) => a.user.id === member.id);
    expect(entry.count).toBe(2);
  });

  it('completions trend has exactly 8 buckets and counts a recent completion in the most recent bucket', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { status: 'DONE' }); // updatedAt = now by default

    const res = await request(app).get('/api/dashboard/completions').set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(8);
    const lastBucket = res.body.data[7];
    expect(lastBucket.count).toBeGreaterThanOrEqual(1);
  });

  it('completions trend places an old completion in an earlier bucket', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    const task = await createTask(p.id, manager.id, { status: 'BACKLOG' });
    // simulate a completion ~6 weeks ago
    await testPrisma.task.update({
      where: { id: task.id },
      data: { status: 'DONE', updatedAt: new Date(Date.now() - 6 * 7 * 86400000 - 86400000) },
    });

    const res = await request(app).get('/api/dashboard/completions').set('Cookie', managerCookie);
    const totalAcrossBuckets = res.body.data.reduce((sum: number, b: any) => sum + b.count, 0);
    expect(totalAcrossBuckets).toBeGreaterThanOrEqual(1);
    // it should not all be dumped in the most recent bucket
    expect(res.body.data[7].count).toBe(0);
  });

  it('handles empty data gracefully (no tasks at all)', async () => {
    const { managerCookie } = await setup();
    // remove all tasks created by setup (there are none by default)
    const summary = await request(app).get('/api/dashboard/summary').set('Cookie', managerCookie);
    expect(summary.status).toBe(200);
    expect(summary.body.data.openTasks).toBe(0);

    const statusRes = await request(app).get('/api/dashboard/status').set('Cookie', managerCookie);
    expect(statusRes.body.data).toEqual([]);

    const assigneesRes = await request(app)
      .get('/api/dashboard/assignees')
      .set('Cookie', managerCookie);
    expect(assigneesRes.body.data).toEqual([]);

    const completionsRes = await request(app)
      .get('/api/dashboard/completions')
      .set('Cookie', managerCookie);
    expect(completionsRes.body.data.every((b: any) => b.count === 0)).toBe(true);
  });

  it('rejects unauthenticated access to any dashboard endpoint', async () => {
    const endpoints = [
      '/api/dashboard/summary',
      '/api/dashboard/status',
      '/api/dashboard/assignees',
      '/api/dashboard/completions',
    ];
    for (const endpoint of endpoints) {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    }
  });
});

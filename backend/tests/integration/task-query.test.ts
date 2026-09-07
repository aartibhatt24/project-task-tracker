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

describe('global task list: search, filters, sorting, pagination', () => {
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

  it('searches by title', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'Fix login bug' });
    await createTask(p.id, manager.id, { title: 'Write docs' });

    const res = await request(app).get('/api/tasks?search=login').set('Cookie', managerCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Fix login bug');
  });

  it('searches by description', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await testPrisma.task.create({
      data: {
        projectId: p.id,
        title: 'Task A',
        description: 'Contains a special keyword: zephyr',
        priority: 'LOW',
        priorityRank: 0,
        status: 'BACKLOG',
        createdById: manager.id,
      },
    });
    await createTask(p.id, manager.id, { title: 'Task B' });

    const res = await request(app).get('/api/tasks?search=zephyr').set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Task A');
  });

  it('filters by projectId', async () => {
    const { managerCookie, visibleProject: p1, hiddenProject: p2, manager } = await setup();
    await createTask(p1.id, manager.id, { title: 'In P1' });
    await createTask(p2.id, manager.id, { title: 'In P2' });

    const res = await request(app)
      .get(`/api/tasks?projectId=${p1.id}`)
      .set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('In P1');
  });

  it('filters by status', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { status: 'DONE' });
    await createTask(p.id, manager.id, { status: 'BACKLOG' });

    const res = await request(app).get('/api/tasks?status=DONE').set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('DONE');
  });

  it('filters by priority', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { priority: 'URGENT' });
    await createTask(p.id, manager.id, { priority: 'LOW' });

    const res = await request(app).get('/api/tasks?priority=URGENT').set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].priority).toBe('URGENT');
  });

  it('filters by assigneeId', async () => {
    const { managerCookie, visibleProject: p, manager, member } = await setup();
    const t1 = await createTask(p.id, manager.id, { title: 'Assigned' });
    await createTask(p.id, manager.id, { title: 'Unassigned' });
    await testPrisma.taskAssignee.create({ data: { taskId: t1.id, userId: member.id } });

    const res = await request(app)
      .get(`/api/tasks?assigneeId=${member.id}`)
      .set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Assigned');
  });

  it('filters by overdue (dueDate in the past and status != DONE)', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    const past = new Date(Date.now() - 5 * 86400000);
    const future = new Date(Date.now() + 5 * 86400000);
    await createTask(p.id, manager.id, { title: 'Overdue', dueDate: past, status: 'IN_PROGRESS' });
    await createTask(p.id, manager.id, {
      title: 'Overdue but done',
      dueDate: past,
      status: 'DONE',
    });
    await createTask(p.id, manager.id, { title: 'Future', dueDate: future });

    const res = await request(app).get('/api/tasks?overdue=true').set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Overdue');
  });

  it('sorts by priority using severity order, not alphabetical', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'L', priority: 'LOW' });
    await createTask(p.id, manager.id, { title: 'U', priority: 'URGENT' });
    await createTask(p.id, manager.id, { title: 'M', priority: 'MEDIUM' });
    await createTask(p.id, manager.id, { title: 'H', priority: 'HIGH' });

    const res = await request(app)
      .get('/api/tasks?sortBy=priority&sortOrder=asc&pageSize=10')
      .set('Cookie', managerCookie);
    expect(res.body.data.map((t: any) => t.title)).toEqual(['L', 'M', 'H', 'U']);

    const desc = await request(app)
      .get('/api/tasks?sortBy=priority&sortOrder=desc&pageSize=10')
      .set('Cookie', managerCookie);
    expect(desc.body.data.map((t: any) => t.title)).toEqual(['U', 'H', 'M', 'L']);
  });

  it('sorts by dueDate', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    const soon = new Date(Date.now() + 1 * 86400000);
    const later = new Date(Date.now() + 10 * 86400000);
    await createTask(p.id, manager.id, { title: 'Later', dueDate: later });
    await createTask(p.id, manager.id, { title: 'Soon', dueDate: soon });

    const res = await request(app)
      .get('/api/tasks?sortBy=dueDate&sortOrder=asc&pageSize=10')
      .set('Cookie', managerCookie);
    const titles = res.body.data.map((t: any) => t.title);
    expect(titles.indexOf('Soon')).toBeLessThan(titles.indexOf('Later'));
  });

  it('paginates results and returns correct metadata', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    for (let i = 0; i < 15; i++) {
      await createTask(p.id, manager.id, { title: `Task ${i}` });
    }

    const page1 = await request(app)
      .get('/api/tasks?pageSize=10&page=1&projectId=' + p.id)
      .set('Cookie', managerCookie);
    expect(page1.body.data).toHaveLength(10);
    expect(page1.body.total).toBe(15);
    expect(page1.body.totalPages).toBe(2);
    expect(page1.body.page).toBe(1);

    const page2 = await request(app)
      .get('/api/tasks?pageSize=10&page=2&projectId=' + p.id)
      .set('Cookie', managerCookie);
    expect(page2.body.data).toHaveLength(5);
  });

  it('applies authorization scope: a member only sees tasks in their projects', async () => {
    const { memberCookie, visibleProject: p1, hiddenProject: p2, manager } = await setup();
    await createTask(p1.id, manager.id, { title: 'Visible' });
    await createTask(p2.id, manager.id, { title: 'Hidden' });

    const res = await request(app).get('/api/tasks?pageSize=50').set('Cookie', memberCookie);
    const titles = res.body.data.map((t: any) => t.title);
    expect(titles).toContain('Visible');
    expect(titles).not.toContain('Hidden');
  });

  it('combines multiple filters together', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'Match', priority: 'HIGH', status: 'IN_PROGRESS' });
    await createTask(p.id, manager.id, {
      title: 'WrongPriority',
      priority: 'LOW',
      status: 'IN_PROGRESS',
    });
    await createTask(p.id, manager.id, { title: 'WrongStatus', priority: 'HIGH', status: 'DONE' });

    const res = await request(app)
      .get(`/api/tasks?projectId=${p.id}&priority=HIGH&status=IN_PROGRESS`)
      .set('Cookie', managerCookie);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Match');
  });

  it('returns an empty result set gracefully', async () => {
    const { managerCookie } = await setup();
    const res = await request(app)
      .get('/api/tasks?search=nonexistent-keyword-xyz')
      .set('Cookie', managerCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });
});

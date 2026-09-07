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

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split('\r\n')
    .map((line) => line.split(','));
}

describe('CSV export', () => {
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

  it('returns valid CSV with a header row and correct content-type', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'Exportable task' });

    const res = await request(app).get('/api/tasks/export.csv').set('Cookie', managerCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const rows = parseCsv(res.text);
    expect(rows[0]).toEqual([
      'id',
      'projectKey',
      'projectName',
      'title',
      'description',
      'status',
      'priority',
      'dueDate',
      'assignees',
      'createdAt',
      'updatedAt',
    ]);
    expect(rows.length).toBe(2);
  });

  it('respects the status filter', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'Done task', status: 'DONE' });
    await createTask(p.id, manager.id, { title: 'Backlog task', status: 'BACKLOG' });

    const res = await request(app)
      .get('/api/tasks/export.csv?status=DONE')
      .set('Cookie', managerCookie);

    const rows = parseCsv(res.text);
    expect(rows.length).toBe(2); // header + 1 row
    expect(rows[1][3]).toBe('Done task');
  });

  it('respects the search filter', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'Unique keyword zeta' });
    await createTask(p.id, manager.id, { title: 'Something else' });

    const res = await request(app)
      .get('/api/tasks/export.csv?search=zeta')
      .set('Cookie', managerCookie);

    const rows = parseCsv(res.text);
    expect(rows.length).toBe(2);
    expect(rows[1][3]).toContain('zeta');
  });

  it('respects sort order (priority severity, matching the list endpoint)', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'L', priority: 'LOW' });
    await createTask(p.id, manager.id, { title: 'U', priority: 'URGENT' });
    await createTask(p.id, manager.id, { title: 'M', priority: 'MEDIUM' });

    const res = await request(app)
      .get('/api/tasks/export.csv?sortBy=priority&sortOrder=asc')
      .set('Cookie', managerCookie);

    const rows = parseCsv(res.text).slice(1);
    expect(rows.map((r) => r[3])).toEqual(['L', 'M', 'U']);
  });

  it('exports every matching row, not just one browser page worth', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    for (let i = 0; i < 45; i++) {
      await createTask(p.id, manager.id, { title: `Bulk task ${i}` });
    }

    const res = await request(app)
      .get(`/api/tasks/export.csv?projectId=${p.id}`)
      .set('Cookie', managerCookie);

    const rows = parseCsv(res.text);
    expect(rows.length).toBe(46); // header + 45 (default page size is only 20, proving no pagination applied)
  });

  it("a member's export never includes tasks from projects they don't belong to", async () => {
    const { memberCookie, visibleProject, hiddenProject, manager } = await setup();
    await createTask(visibleProject.id, manager.id, { title: 'Visible task' });
    await createTask(hiddenProject.id, manager.id, { title: 'Hidden task' });

    const res = await request(app).get('/api/tasks/export.csv').set('Cookie', memberCookie);
    expect(res.text).toContain('Visible task');
    expect(res.text).not.toContain('Hidden task');
  });

  it('escapes commas and quotes in task titles', async () => {
    const { managerCookie, visibleProject: p, manager } = await setup();
    await createTask(p.id, manager.id, { title: 'Title, with "quotes" and comma' });

    const res = await request(app).get('/api/tasks/export.csv').set('Cookie', managerCookie);
    expect(res.text).toContain('"Title, with ""quotes"" and comma"');
  });

  it('rejects unauthenticated export requests', async () => {
    const res = await request(app).get('/api/tasks/export.csv');
    expect(res.status).toBe(401);
  });
});

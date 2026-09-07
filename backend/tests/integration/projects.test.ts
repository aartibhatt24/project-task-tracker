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

describe('projects and membership', () => {
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

  async function managerCookie() {
    const manager = await createUser({ role: 'MANAGER' });
    const cookie = await loginAndGetCookie(app, manager.email, TEST_PASSWORD);
    return { manager, cookie };
  }

  async function memberCookie() {
    const member = await createUser({ role: 'MEMBER' });
    const cookie = await loginAndGetCookie(app, member.email, TEST_PASSWORD);
    return { member, cookie };
  }

  it('lets a manager create, read, update, archive and restore a project', async () => {
    const { cookie } = await managerCookie();

    const createRes = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ key: 'proj1', name: 'Project One', description: 'desc' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.key).toBe('PROJ1');
    const id = createRes.body.data.id;

    const getRes = await request(app).get(`/api/projects/${id}`).set('Cookie', cookie);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.name).toBe('Project One');
    // creating manager is auto-added as a member
    expect(getRes.body.data.members.length).toBe(1);

    const updateRes = await request(app)
      .patch(`/api/projects/${id}`)
      .set('Cookie', cookie)
      .send({ name: 'Renamed' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Renamed');

    const archiveRes = await request(app).post(`/api/projects/${id}/archive`).set('Cookie', cookie);
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.archived).toBe(true);

    const listRes = await request(app).get('/api/projects').set('Cookie', cookie);
    expect(listRes.body.data.find((p: any) => p.id === id)).toBeUndefined();

    const listAllRes = await request(app)
      .get('/api/projects?includeArchived=true')
      .set('Cookie', cookie);
    expect(listAllRes.body.data.find((p: any) => p.id === id)).toBeDefined();

    const restoreRes = await request(app).post(`/api/projects/${id}/restore`).set('Cookie', cookie);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.data.archived).toBe(false);

    const listAfterRestore = await request(app).get('/api/projects').set('Cookie', cookie);
    expect(listAfterRestore.body.data.find((p: any) => p.id === id)).toBeDefined();
  });

  it('rejects project creation with a duplicate key', async () => {
    const { cookie } = await managerCookie();
    await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ key: 'DUPKEY', name: 'A' });
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ key: 'DUPKEY', name: 'B' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROJECT_KEY_TAKEN');
  });

  it('rejects a member trying to create/edit/archive/manage members (403)', async () => {
    const { manager } = await managerCookie();
    const project = await createProject(manager.id);
    const { cookie } = await memberCookie();

    const create = await request(app)
      .post('/api/projects')
      .set('Cookie', cookie)
      .send({ key: 'MEMBLOCK', name: 'X' });
    expect(create.status).toBe(403);

    const update = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set('Cookie', cookie)
      .send({ name: 'hacked' });
    expect(update.status).toBe(403);

    const archive = await request(app)
      .post(`/api/projects/${project.id}/archive`)
      .set('Cookie', cookie);
    expect(archive.status).toBe(403);

    const addMemberRes = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set('Cookie', cookie)
      .send({ userId: manager.id });
    expect(addMemberRes.status).toBe(403);
  });

  it('a member cannot retrieve a project they do not belong to (IDOR)', async () => {
    const { manager } = await managerCookie();
    const project = await createProject(manager.id);
    const { cookie } = await memberCookie();

    const res = await request(app).get(`/api/projects/${project.id}`).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('a member only sees projects they belong to in the list', async () => {
    const { manager } = await managerCookie();
    const visibleProject = await createProject(manager.id);
    const hiddenProject = await createProject(manager.id);
    const { member, cookie } = await memberCookie();
    await addMember(visibleProject.id, member.id);

    const res = await request(app).get('/api/projects').set('Cookie', cookie);
    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).toContain(visibleProject.id);
    expect(ids).not.toContain(hiddenProject.id);
  });

  it('a manager sees all projects regardless of membership', async () => {
    const { manager, cookie } = await managerCookie();
    const otherManager = await createUser({ role: 'MANAGER' });
    const project = await createProject(otherManager.id);

    const res = await request(app).get('/api/projects').set('Cookie', cookie);
    const ids = res.body.data.map((p: any) => p.id);
    expect(ids).toContain(project.id);
    expect(manager.id).not.toBe(otherManager.id);
  });

  it('removing a project member unassigns them from every task in that project (atomic)', async () => {
    const { manager, cookie } = await managerCookie();
    const project = await createProject(manager.id);
    const { member } = await memberCookie();
    await addMember(project.id, member.id);

    const taskA = await createTask(project.id, manager.id, { title: 'A' });
    const taskB = await createTask(project.id, manager.id, { title: 'B' });
    await testPrisma.taskAssignee.create({ data: { taskId: taskA.id, userId: member.id } });
    await testPrisma.taskAssignee.create({ data: { taskId: taskB.id, userId: member.id } });

    const removeRes = await request(app)
      .delete(`/api/projects/${project.id}/members/${member.id}`)
      .set('Cookie', cookie);
    expect(removeRes.status).toBe(204);

    const remainingMembership = await testPrisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: project.id, userId: member.id } },
    });
    expect(remainingMembership).toBeNull();

    const remainingAssignments = await testPrisma.taskAssignee.findMany({
      where: { userId: member.id, task: { projectId: project.id } },
    });
    expect(remainingAssignments).toHaveLength(0);

    const historyA = await testPrisma.taskHistory.findMany({
      where: { taskId: taskA.id, type: 'UNASSIGNED' },
    });
    const historyB = await testPrisma.taskHistory.findMany({
      where: { taskId: taskB.id, type: 'UNASSIGNED' },
    });
    expect(historyA).toHaveLength(1);
    expect(historyB).toHaveLength(1);
    expect(historyA[0].oldValue).toBe(member.id);
  });

  it('removed member loses project access', async () => {
    const { manager, cookie } = await managerCookie();
    const project = await createProject(manager.id);
    const { member, cookie: memberCookieVal } = await memberCookie();
    await addMember(project.id, member.id);

    const before = await request(app)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', memberCookieVal);
    expect(before.status).toBe(200);

    await request(app)
      .delete(`/api/projects/${project.id}/members/${member.id}`)
      .set('Cookie', cookie);

    const after = await request(app)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', memberCookieVal);
    expect(after.status).toBe(403);
  });

  it('returns 404 for a non-existent project id', async () => {
    const { cookie } = await managerCookie();
    const res = await request(app).get('/api/projects/does-not-exist').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });

  it('rejects adding a non-existent user as a member', async () => {
    const { manager, cookie } = await managerCookie();
    const project = await createProject(manager.id);
    const res = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set('Cookie', cookie)
      .send({ userId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects adding a member who is already a member', async () => {
    const { manager, cookie } = await managerCookie();
    const project = await createProject(manager.id);
    const { member } = await memberCookie();
    await addMember(project.id, member.id);

    const res = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set('Cookie', cookie)
      .send({ userId: member.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('rejects all project routes without authentication', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });
});
